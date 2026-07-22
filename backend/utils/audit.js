const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

function logAudit({ userId = null, action, entityType = null, entityId = null, details = null, ip = null }) {
  try {
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(uuidv4(), userId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip);
  } catch (err) {
    // Never let audit logging crash the request
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
