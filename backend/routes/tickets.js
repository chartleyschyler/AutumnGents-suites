const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);

// GET /api/tickets - occupant sees own; admin/tech sees all
router.get('/', (req, res) => {
  const rows =
    req.user.role === 'occupant'
      ? db.prepare(`SELECT * FROM maintenance_tickets WHERE raised_by = ? ORDER BY created_at DESC`).all(req.user.id)
      : db.prepare(`SELECT t.*, u.full_name AS raised_by_name FROM maintenance_tickets t JOIN users u ON u.id = t.raised_by ORDER BY t.created_at DESC`).all();
  res.json({ tickets: rows });
});

// POST /api/tickets - occupant raises a maintenance/tech issue
router.post('/', requireRole('occupant'), (req, res) => {
  const { title, description, priority, roomId } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO maintenance_tickets (id, raised_by, room_id, title, description, priority)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.user.id, roomId || req.user.room_id || null, title, description || null, priority || 'normal');

  logAudit({ userId: req.user.id, action: 'TICKET_CREATED', entityType: 'ticket', entityId: id });
  res.status(201).json({ message: 'Ticket submitted.', ticketId: id });
});

// PATCH /api/tickets/:id - tech/admin updates status
router.patch('/:id', requireRole('admin', 'tech'), (req, res) => {
  const { status, assignedTo } = req.body;
  db.prepare(
    `UPDATE maintenance_tickets SET status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to), updated_at = datetime('now') WHERE id = ?`
  ).run(status, assignedTo, req.params.id);

  logAudit({ userId: req.user.id, action: 'TICKET_UPDATED', entityType: 'ticket', entityId: req.params.id, details: req.body });
  res.json({ message: 'Ticket updated.' });
});

module.exports = router;
