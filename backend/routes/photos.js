const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { upload } = require('../middleware/upload');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/photos  (public - landing page gallery)
router.get('/', (req, res) => {
  const { category } = req.query;
  const photos = category
    ? db.prepare(`SELECT * FROM photos WHERE category = ? ORDER BY display_order ASC, created_at DESC`).all(category)
    : db.prepare(`SELECT * FROM photos ORDER BY display_order ASC, created_at DESC`).all();
  res.json({ photos });
});

// POST /api/photos  (admin/tech only)
router.post('/', requireAuth, requireRole('admin', 'tech'), upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });

  const { category, caption, roomId, displayOrder } = req.body;
  const id = uuidv4();
  const url = `/uploads/photos/${req.file.filename}`;

  db.prepare(
    `INSERT INTO photos (id, url, category, room_id, caption, display_order, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, url, category || 'gallery', roomId || null, caption || null, displayOrder || 0, req.user.id);

  logAudit({ userId: req.user.id, action: 'PHOTO_UPLOADED', entityType: 'photo', entityId: id });
  res.status(201).json({ message: 'Photo uploaded.', photo: { id, url } });
});

router.delete('/:id', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'PHOTO_DELETED', entityType: 'photo', entityId: req.params.id });
  res.json({ message: 'Photo deleted.' });
});

module.exports = router;
