const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');
const { sendMail, templates } = require('../utils/email');

const router = express.Router();
router.use(requireAuth);

// GET /api/users  (admin only - full roster)
router.get('/', requireRole('admin'), (req, res) => {
  const { role } = req.query;
  let rows;
  if (role) {
    rows = db.prepare(
      `SELECT id, full_name, email, phone, role, room_id, status, created_at FROM users WHERE role = ? ORDER BY created_at DESC`
    ).all(role);
  } else {
    rows = db.prepare(
      `SELECT id, full_name, email, phone, role, room_id, status, created_at FROM users ORDER BY created_at DESC`
    ).all();
  }
  res.json({ users: rows });
});

// POST /api/users  (admin only - create ADMIN, TECH, or OCCUPANT accounts directly)
// This is the ONLY way tech/admin accounts get created - never through public signup.
router.post(
  '/',
  requireRole('admin'),
  [
    body('fullName').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(['admin', 'tech', 'occupant']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fullName, email, password, role, phone, roomId } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already in use.' });

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const id = uuidv4();

    db.prepare(
      `INSERT INTO users (id, full_name, email, phone, password_hash, role, room_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
    ).run(id, fullName, email, phone || null, passwordHash, role, roomId || null);

    if (role === 'occupant' && roomId) {
      db.prepare(`UPDATE rooms SET status = 'occupied' WHERE id = ?`).run(roomId);
    }

    logAudit({ userId: req.user.id, action: 'USER_CREATED', entityType: 'user', entityId: id, details: { role } });

    if (role === 'occupant') {
      const room = roomId ? db.prepare('SELECT room_number FROM rooms WHERE id = ?').get(roomId) : null;
      sendMail({ to: email, ...templates.welcomeOccupant(fullName, room?.room_number) }).catch(() => {});
    }

    res.status(201).json({ message: `${role} account created.`, userId: id });
  }
);

// PATCH /api/users/:id  (admin: edit anyone; user: edit own basic profile)
router.patch('/:id', (req, res) => {
  const targetId = req.params.id;
  const isSelf = req.user.id === targetId;
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Not permitted.' });

  const allowedFieldsSelf = ['full_name', 'phone', 'profile_photo_url', 'emergency_contact'];
  const allowedFieldsAdmin = [...allowedFieldsSelf, 'status', 'room_id', 'role', 'national_id'];
  const allowed = isAdmin ? allowedFieldsAdmin : allowedFieldsSelf;

  const updates = [];
  const values = [];
  for (const field of allowed) {
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[camel]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });

  values.push(targetId);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  logAudit({ userId: req.user.id, action: 'USER_UPDATED', entityType: 'user', entityId: targetId, details: req.body });
  res.json({ message: 'Updated.' });
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'USER_DELETED', entityType: 'user', entityId: req.params.id });
  res.json({ message: 'User deleted.' });
});

module.exports = router;
