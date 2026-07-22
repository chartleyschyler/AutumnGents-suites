const { verifyAccessToken } = require('../utils/jwt');
const db = require('../config/db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = db.prepare('SELECT id, full_name, email, role, status FROM users WHERE id = ?').get(payload.sub);

    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
