const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', (req, res) => {
  const rules = db.prepare(`SELECT * FROM rules WHERE is_active = 1 ORDER BY display_order ASC`).all();
  res.json({ rules });
});

router.post('/', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const { title, content, displayOrder } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required.' });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO rules (id, title, content, display_order, updated_by) VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, content, displayOrder || 0, req.user.id);

  logAudit({ userId: req.user.id, action: 'RULE_CREATED', entityType: 'rule', entityId: id });
  res.status(201).json({ message: 'Rule added.', ruleId: id });
});

router.patch('/:id', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const { title, content, displayOrder, isActive } = req.body;
  db.prepare(
    `UPDATE rules SET title = COALESCE(?, title), content = COALESCE(?, content),
     display_order = COALESCE(?, display_order), is_active = COALESCE(?, is_active),
     updated_by = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, content, displayOrder, isActive, req.user.id, req.params.id);

  logAudit({ userId: req.user.id, action: 'RULE_UPDATED', entityType: 'rule', entityId: req.params.id });
  res.json({ message: 'Rule updated.' });
});

router.delete('/:id', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'RULE_DELETED', entityType: 'rule', entityId: req.params.id });
  res.json({ message: 'Rule removed.' });
});

module.exports = router;
