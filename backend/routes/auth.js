const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { logAudit } = require('../utils/audit');
const { sendMail, templates } = require('../utils/email');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Strict limiter on login to slow brute-force attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// ---------------------------------------------------------------------
// POST /api/auth/login
// Single endpoint for all three roles - role is read from the DB record,
// never trusted from the client, so nobody can "log in as admin" by
// tampering with a form field.
// ---------------------------------------------------------------------
router.post(
  '/login',
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Valid email and password required.' });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked due to failed attempts. Try again later.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      const newCount = (user.failed_login_count || 0) + 1;
      let lockedUntil = null;
      if (newCount >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
      }
      db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?').run(newCount, lockedUntil, user.id);
      logAudit({ userId: user.id, action: 'LOGIN_FAILED', ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Contact the administrator.' });
    }

    // Success - reset lockout counters
    db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    db.prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id, refreshHash, req.headers['user-agent'] || '', req.ip);

    logAudit({ userId: user.id, action: 'LOGIN_SUCCESS', ip: req.ip });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        roomId: user.room_id,
      },
    });
  }
);

// ---------------------------------------------------------------------
// POST /api/auth/register  (public self-signup - OCCUPANTS ONLY)
// Admin and tech accounts can never be created through this public
// endpoint - only an existing admin can create those (see routes/users.js)
// ---------------------------------------------------------------------
router.post(
  '/register',
  [
    body('fullName').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('phone').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fullName, email, password, phone, nationalId, emergencyContact } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();

    db.prepare(
      `INSERT INTO users (id, full_name, email, phone, password_hash, role, national_id, emergency_contact, status)
       VALUES (?, ?, ?, ?, ?, 'occupant', ?, ?, 'pending')`
    ).run(id, fullName, email, phone || null, passwordHash, nationalId || null, emergencyContact || null);

    logAudit({ userId: id, action: 'USER_REGISTERED', entityType: 'user', entityId: id, ip: req.ip });

    sendMail({ to: email, ...templates.welcomeOccupant(fullName, null) }).catch(() => {});

    res.status(201).json({ message: 'Account created. An admin will confirm your room assignment shortly.' });
  }
);

// ---------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = db.prepare(
      'SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked = 0'
    ).get(payload.sub, tokenHash);

    if (!stored || new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token invalid or expired.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });

    const newAccessToken = signAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------
router.post('/logout', requireAuth, (req, res) => {
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(req.user.id);
  logAudit({ userId: req.user.id, action: 'LOGOUT', ip: req.ip });
  res.json({ message: 'Logged out.' });
});

// ---------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Always return 200 - never reveal whether an email exists in the system
  if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at)
     VALUES (?, ?, ?, 'password_reset', datetime('now', '+1 hour'))`
  ).run(uuidv4(), user.id, tokenHash);

  const resetLink = `${process.env.CLIENT_URL}/reset-password.html?token=${rawToken}&uid=${user.id}`;
  sendMail({ to: email, ...templates.passwordReset(user.full_name, resetLink) }).catch(() => {});

  logAudit({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', ip: req.ip });
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// ---------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------
router.post(
  '/reset-password',
  [body('userId').notEmpty(), body('token').notEmpty(), body('newPassword').isLength({ min: 8 })],
  async (req, res) => {
    const { userId, token, newPassword } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const record = db.prepare(
      `SELECT * FROM auth_tokens WHERE user_id = ? AND token_hash = ? AND type = 'password_reset' AND used = 0`
    ).get(userId, tokenHash);

    if (!record || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    db.prepare('UPDATE auth_tokens SET used = 1 WHERE id = ?').run(record.id);
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId); // force re-login everywhere

    logAudit({ userId, action: 'PASSWORD_RESET_COMPLETED', ip: req.ip });
    res.json({ message: 'Password updated. Please log in with your new password.' });
  }
);

// ---------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    `SELECT id, full_name, email, phone, role, room_id, profile_photo_url, status, created_at FROM users WHERE id = ?`
  ).get(req.user.id);
  res.json({ user });
});

module.exports = router;
