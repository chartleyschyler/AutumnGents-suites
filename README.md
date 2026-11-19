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
