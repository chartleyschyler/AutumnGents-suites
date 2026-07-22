const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', (req, res) => {
  const updates = db.prepare(`SELECT * FROM updates ORDER BY pinned DESC, created_at DESC LIMIT 50`).all();
  res.json({ updates });
});

router.post('/', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const { title, content, audience, pinned } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required.' });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO updates (id, title, content, audience, pinned, posted_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title, content, audience || 'all', pinned ? 1 : 0, req.user.id);

  logAudit({ userId: req.user.id, action: 'UPDATE_POSTED', entityType: 'update', entityId: id });
  res.status(201).json({ message: 'Update posted.', updateId: id });
});

router.delete('/:id', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  db.prepare('DELETE FROM updates WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'UPDATE_DELETED', entityType: 'update', entityId: req.params.id });
  res.json({ message: 'Update removed.' });
});

module.exports = router;
