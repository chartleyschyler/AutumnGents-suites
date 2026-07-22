const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// GET /api/rooms  (public - for the pricing section on the landing page)
router.get('/', (req, res) => {
  const rooms = db.prepare(`SELECT * FROM rooms ORDER BY price_monthly ASC`).all();
  res.json({ rooms });
});

router.get('/:id', (req, res) => {
  const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room });
});

// Everything below requires admin or tech
router.use(requireAuth, requireRole('admin', 'tech'));

router.post(
  '/',
  [
    body('roomNumber').trim().notEmpty(),
    body('roomType').isIn(['single', 'double', 'shared', 'dormitory', 'suite']),
    body('priceMonthly').isFloat({ min: 0 }),
    body('capacity').isInt({ min: 1 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { roomNumber, roomType, capacity, priceMonthly, description, amenities, locationId, priceCurrency } = req.body;
    const id = uuidv4();

    db.prepare(
      `INSERT INTO rooms (id, location_id, room_number, room_type, capacity, price_monthly, price_currency, description, amenities)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, locationId || null, roomNumber, roomType, capacity, priceMonthly, priceCurrency || 'KES', description || null, JSON.stringify(amenities || []));

    logAudit({ userId: req.user.id, action: 'ROOM_CREATED', entityType: 'room', entityId: id });
    res.status(201).json({ message: 'Room created.', roomId: id });
  }
);

router.patch('/:id', (req, res) => {
  const fields = ['room_number', 'room_type', 'capacity', 'price_monthly', 'price_currency', 'description', 'status', 'amenities'];
  const updates = [];
  const values = [];
  for (const field of fields) {
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'amenities' ? JSON.stringify(req.body[camel]) : req.body[camel]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields.' });

  values.push(req.params.id);
  db.prepare(`UPDATE rooms SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  logAudit({ userId: req.user.id, action: 'ROOM_UPDATED', entityType: 'room', entityId: req.params.id, details: req.body });
  res.json({ message: 'Room updated.' });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  logAudit({ userId: req.user.id, action: 'ROOM_DELETED', entityType: 'room', entityId: req.params.id });
  res.json({ message: 'Room deleted.' });
});

module.exports = router;
