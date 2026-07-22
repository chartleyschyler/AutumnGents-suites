const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT a.*, u.full_name, u.email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 300`
  ).all();
  res.json({ logs: rows });
});

module.exports = router;
