const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', (req, res) => {
  const locations = db.prepare(`SELECT * FROM locations WHERE is_active = 1`).all();
  res.json({ locations });
});

router.post('/', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const { name, address, city, country, latitude, longitude, description, mapEmbedUrl } = req.body;
  if (!name || !address) return res.status(400).json({ error: 'Name and address required.' });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO locations (id, name, address, city, country, latitude, longitude, description, map_embed_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, address, city || null, country || 'Kenya', latitude || null, longitude || null, description || null, mapEmbedUrl || null);

  logAudit({ userId: req.user.id, action: 'LOCATION_CREATED', entityType: 'location', entityId: id });
  res.status(201).json({ message: 'Location added.', locationId: id });
});

router.patch('/:id', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const fields = ['name', 'address', 'city', 'country', 'latitude', 'longitude', 'description', 'map_embed_url', 'is_active'];
  const updates = [];
  const values = [];
  for (const field of fields) {
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[camel]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields.' });
  values.push(req.params.id);
  db.prepare(`UPDATE locations SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  logAudit({ userId: req.user.id, action: 'LOCATION_UPDATED', entityType: 'location', entityId: req.params.id });
  res.json({ message: 'Location updated.' });
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'LOCATION_DELETED', entityType: 'location', entityId: req.params.id });
  res.json({ message: 'Location deleted.' });
});

module.exports = router;
