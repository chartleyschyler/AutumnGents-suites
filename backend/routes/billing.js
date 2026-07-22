const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAudit } = require('../utils/audit');
const { sendMail, templates } = require('../utils/email');

const router = express.Router();

// Stripe is only instantiated if a real key is present, so the app
// doesn't crash before you've set up your Stripe account.
let stripe = null;
if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('replace')) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// ---------------------------------------------------------------------
// POST /api/billing/checkout  (occupant - pay their accommodation fee)
// ---------------------------------------------------------------------
router.post('/checkout', requireAuth, requireRole('occupant'), async (req, res) => {
  const { amount, billingPeriod } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required.' });

  const currency = process.env.CURRENCY || 'kes';
  const paymentId = uuidv4();

  db.prepare(
    `INSERT INTO payments (id, user_id, amount, currency, billing_period, method, status)
     VALUES (?, ?, ?, ?, ?, 'card', 'pending')`
  ).run(paymentId, req.user.id, amount, currency.toUpperCase(), billingPeriod || null);

  if (!stripe) {
    return res.status(503).json({
      error: 'Online payments are not configured yet. Add a real STRIPE_SECRET_KEY to .env to enable this.',
      paymentId,
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `Accommodation fee - ${billingPeriod || 'Autumn Gents Suites'}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: req.user.email,
      metadata: { paymentId, userId: req.user.id },
      success_url: `${process.env.CLIENT_URL}/dashboard-occupant.html?payment=success`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard-occupant.html?payment=cancelled`,
    });

    db.prepare('UPDATE payments SET stripe_session_id = ? WHERE id = ?').run(session.id, paymentId);
    res.json({ checkoutUrl: session.url, paymentId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start checkout session.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/billing/webhook  (Stripe calls this - must use raw body,
// mounted separately in server.js BEFORE the JSON body parser)
// ---------------------------------------------------------------------
async function stripeWebhookHandler(req, res) {
  if (!stripe) return res.status(503).send('Stripe not configured.');

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    if (paymentId) {
      db.prepare(
        `UPDATE payments SET status = 'completed', stripe_payment_intent = ?, paid_at = datetime('now') WHERE id = ?`
      ).run(session.payment_intent, paymentId);

      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payment.user_id);
      if (user) {
        sendMail({ to: user.email, ...templates.paymentReceipt(user.full_name, payment.amount, payment.currency, payment.billing_period) }).catch(() => {});
      }
      logAudit({ userId: payment?.user_id, action: 'PAYMENT_COMPLETED', entityType: 'payment', entityId: paymentId });
    }
  }

  res.json({ received: true });
}

// ---------------------------------------------------------------------
// GET /api/billing/history  (occupant sees own; admin sees all)
// ---------------------------------------------------------------------
router.get('/history', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'admin' || req.user.role === 'tech') {
    rows = db.prepare(
      `SELECT p.*, u.full_name, u.email FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 200`
    ).all();
  } else {
    rows = db.prepare(`SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC`).all(req.user.id);
  }
  res.json({ payments: rows });
});

// POST /api/billing/manual  (admin - record cash/bank/M-Pesa payments manually)
router.post('/manual', requireAuth, requireRole('admin'), (req, res) => {
  const { userId, amount, currency, method, billingPeriod } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required.' });

  const id = uuidv4();
  db.prepare(
    `INSERT INTO payments (id, user_id, amount, currency, billing_period, method, status, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', datetime('now'))`
  ).run(id, userId, amount, currency || 'KES', billingPeriod || null, method || 'cash');

  logAudit({ userId: req.user.id, action: 'MANUAL_PAYMENT_RECORDED', entityType: 'payment', entityId: id, details: { userId, amount } });
  res.status(201).json({ message: 'Payment recorded.', paymentId: id });
});

module.exports = { router, stripeWebhookHandler };
