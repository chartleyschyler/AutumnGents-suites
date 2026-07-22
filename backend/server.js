require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('./config/db'); // initializes DB + runs schema on boot

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/rooms');
const photoRoutes = require('./routes/photos');
const ruleRoutes = require('./routes/rules');
const updateRoutes = require('./routes/updates');
const settingsRoutes = require('./routes/settings');
const locationRoutes = require('./routes/locations');
const { router: billingRoutes, stripeWebhookHandler } = require('./routes/billing');
const ticketRoutes = require('./routes/tickets');
const auditRoutes = require('./routes/audit');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

// ---------------------------------------------------------------------
// SECURITY MIDDLEWARE
// ---------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// General API rate limiter (separate, stricter limiter applied to /login)
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', generalLimiter);

// Stripe webhook needs the RAW body, so it must be registered
// BEFORE express.json() touches the request stream.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend assets for production deployments that use a single service
app.use(express.static(frontendPath));

// ---------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/audit-logs', auditRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', site: 'Autumn Gents Suites' }));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 404 handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// Central error handler (never leak stack traces to clients)
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(err.status || 500).json({ error: 'Something went wrong on our end.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Autumn Gents Suites API running on port ${PORT}`);
});
