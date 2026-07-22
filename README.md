# Autumn Gents Suites — Hostel Management System

A full-stack hostel management web application with three login roles
(Admin, IT Tech, Occupant), a public landing page, an admin/tech-editable
content backend, and online billing.

## What's included

- **Public landing page** — site description, history, photo gallery,
  rules, live updates, room pricing, locations, and social links (all
  editable from the admin/tech dashboard — nothing is hardcoded).
- **Three auth roles** — Admin, Tech, Occupant, each with its own
  dashboard and permissions, sharing a single secure login page.
- **Admin dashboard** — manage users (create tech/occupant accounts),
  rooms & pricing, photos, rules, updates, locations, billing/payments,
  maintenance tickets, site description/theme, and a security audit log.
- **Tech dashboard** — manage photos, rules, pricing, updates, interface
  theme, and maintenance tickets (no access to user accounts or finances).
- **Occupant dashboard** — profile, room info, house rules, updates, pay
  accommodation fees online, and submit maintenance requests.
- **Database** — SQLite (via better-sqlite3), modeling users, rooms,
  bookings, payments, photos, rules, updates, locations, site settings,
  maintenance tickets, and a full audit log.
- **Billing** — Stripe Checkout integration for card payments, plus a
  manual-entry option for cash/bank/M-Pesa payments recorded by admin.
- **Email** — Nodemailer wiring for welcome emails, payment receipts,
  and password resets, sent from the site's own mailbox.
- **Security** — bcrypt password hashing, JWT access + refresh tokens,
  role-based access control, rate limiting & account lockout on repeated
  failed logins, helmet security headers, input validation, parameterized
  SQL queries (no injection risk), and an audit trail of sensitive actions.

## Two things this project can't do for you

1. **It can't create a real email inbox.** `SITE_EMAIL_ADDRESS` in
   `.env` needs a mailbox you've actually created with a provider —
   [Zoho Mail](https://www.zoho.com/mail/) has a free plan for a custom
   domain, or use Google Workspace. Once created, drop its SMTP
   credentials into `.env` and outgoing mail (welcome emails, receipts,
   password resets) will work automatically.
2. **It can't create a live Stripe account.** Sign up at
   [dashboard.stripe.com](https://dashboard.stripe.com), grab your API
   keys from Developers → API keys, and put them in `.env`. Until then,
   the "Pay Online" button will tell occupants that online payments
   aren't configured yet, and admin can record payments manually.

## Project structure

```
autumn-gents-suites/
├── backend/
│   ├── config/db.js          # SQLite connection + schema bootstrap
│   ├── middleware/           # auth, role checks, file upload
│   ├── models/
│   │   ├── schema.sql        # full database schema
│   │   └── seed.js           # creates first admin/tech + sample content
│   ├── routes/                # one file per resource (auth, users, rooms...)
│   ├── utils/                 # JWT helpers, email, audit logging
│   ├── uploads/photos/        # uploaded images land here
│   ├── server.js              # Express app entry point
│   ├── package.json
│   └── .env.example           # copy to .env and fill in real values
└── frontend/
    ├── index.html              # public landing page
    ├── login.html               # shared login for all 3 roles
    ├── register.html            # occupant self-signup
    ├── forgot-password.html / reset-password.html
    ├── dashboard-admin.html + js/dashboard-admin.js
    ├── dashboard-tech.html  + js/dashboard-tech.js
    ├── dashboard-occupant.html + js/dashboard-occupant.js
    ├── css/style.css            # dark navy/black theme
    └── js/api.js                 # shared fetch/auth helper
```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set at minimum:
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — run `openssl rand -hex 32` twice
- `CLIENT_URL` — where your frontend is served from
- (optional for now) SMTP and Stripe credentials — see above

Create the database and seed the first admin/tech accounts:

```bash
npm run seed
```

This prints the seeded login credentials to your terminal, e.g.:
```
Created admin: admin@autumngentssuites.com / ChangeMe_Admin123!
Created tech: tech@autumngentssuites.com / ChangeMe_Tech123!
```

**Log in and change these passwords immediately** (Admin → Users, or
have each account use "Forgot password").

Start the server:

```bash
npm start          # production
npm run dev         # auto-restart on changes (needs nodemon, already in devDependencies)
```

The API runs on `http://localhost:5000` by default.

### 2. Frontend

The frontend is plain HTML/CSS/JS — no build step. Serve the `frontend/`
folder with any static server, for example:

```bash
cd frontend
npx serve -l 3000
```

Then visit `http://localhost:3000`. `frontend/js/api.js` points to
`http://localhost:5000/api` by default — change `API_BASE` there once
you deploy the backend somewhere else.

### 3. First login

- **Admin**: use the seeded admin email/password, go to the Users tab,
  and create your real admin, tech, and occupant accounts from there.
- **Tech**: created the same way, by an admin, from the Users tab.
- **Occupants**: can either self-register on `register.html` (status
  starts as "pending" until admin assigns a room) or be created
  directly by admin with a room already attached.

## Deploying for real

- Host the backend (Render, Railway, Fly.io, a VPS, etc.) and set
  `NODE_ENV=production` plus real secrets in its environment variables.
- Host the frontend as static files (Netlify, Vercel, Cloudflare Pages,
  or the same server as the backend) and update `API_BASE` in
  `frontend/js/api.js` to your backend's public URL.
- Put a real domain in front of both and enable HTTPS (most of the
  hosts above do this for you automatically) — cookies/tokens should
  never travel over plain HTTP in production.
- Register your custom-domain mailbox and Stripe account as described
  above, then update `.env` with the real values.

## Security notes

- Passwords are hashed with bcrypt (12 salt rounds) — never stored in
  plain text.
- Access tokens (JWT) expire in 8 hours by default; refresh tokens
  rotate and can be revoked (logout revokes all of a user's tokens).
- 5 failed login attempts locks an account for 15 minutes.
- All admin/tech write actions are recorded in the audit log
  (visible to admin under "Audit Log").
- File uploads are restricted to image types and capped at 8MB by
  default (`MAX_UPLOAD_MB` in `.env`).
- Stripe webhook signatures are verified before any payment is marked
  complete — the frontend can never mark its own payment as paid.
