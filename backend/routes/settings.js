const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/settings  (public - powers the landing page description,
// history, theme colors, and social links)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  rows.forEach((r) => { settings[r.setting_key] = r.setting_value; });
  res.json({ settings });
});

// PATCH /api/settings  (admin/tech only - body is { key: value, key2: value2, ... })
router.patch('/', requireAuth, requireRole('admin', 'tech'), (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: 'No settings provided.' });

  const upsert = db.prepare(
    `INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
       updated_by = excluded.updated_by, updated_at = datetime('now')`
  );

  const tx = db.transaction((items) => {
    for (const [key, value] of items) {
      upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value), req.user.id);
    }
  });
  tx(entries);

  logAudit({ userId: req.user.id, action: 'SETTINGS_UPDATED', details: req.body });
  res.json({ message: 'Settings updated.' });
});

module.exports = router;
