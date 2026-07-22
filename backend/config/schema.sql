-- =====================================================================
-- AUTUMN GENTS SUITES — DATABASE SCHEMA (SQLite)
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- USERS  (admin | tech | occupant)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,               -- UUID
    full_name           TEXT NOT NULL,
    email               TEXT UNIQUE NOT NULL,
    phone               TEXT,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('admin','tech','occupant')),
    profile_photo_url   TEXT,
    national_id         TEXT,                           -- occupants: ID/passport number
    emergency_contact   TEXT,
    room_id             TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending','vacated')),
    email_verified      INTEGER NOT NULL DEFAULT 0,
    two_factor_enabled  INTEGER NOT NULL DEFAULT 0,
    two_factor_secret   TEXT,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    last_login_at       TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- REFRESH TOKENS (for JWT rotation / logout-everywhere)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    user_agent  TEXT,
    ip_address  TEXT,
    revoked     INTEGER NOT NULL DEFAULT 0,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- PASSWORD RESET / EMAIL VERIFICATION TOKENS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('password_reset','email_verify')),
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- LOCATIONS  (a hostel brand can have multiple branches/locations)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    address      TEXT NOT NULL,
    city         TEXT,
    country      TEXT DEFAULT 'Kenya',
    latitude     REAL,
    longitude    REAL,
    description  TEXT,
    map_embed_url TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- ROOMS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id             TEXT PRIMARY KEY,
    location_id    TEXT REFERENCES locations(id) ON DELETE SET NULL,
    room_number    TEXT NOT NULL,
    room_type      TEXT NOT NULL CHECK (room_type IN ('single','double','shared','dormitory','suite')),
    capacity       INTEGER NOT NULL DEFAULT 1,
    price_monthly  REAL NOT NULL,
    price_currency TEXT NOT NULL DEFAULT 'KES',
    description    TEXT,
    amenities      TEXT,                 -- JSON array as text e.g. ["wifi","desk","wardrobe"]
    status         TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','maintenance','reserved')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- BOOKINGS / TENANCY RECORDS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    check_in    TEXT NOT NULL,
    check_out   TEXT,
    monthly_rate REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','cancelled')),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- PAYMENTS / BILLING
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id         TEXT REFERENCES bookings(id) ON DELETE SET NULL,
    amount             REAL NOT NULL,
    currency           TEXT NOT NULL DEFAULT 'KES',
    billing_period     TEXT,                     -- e.g. '2026-07'
    method             TEXT NOT NULL DEFAULT 'card' CHECK (method IN ('card','mpesa','bank_transfer','cash')),
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
    stripe_session_id  TEXT,
    stripe_payment_intent TEXT,
    receipt_url        TEXT,
    paid_at            TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- PHOTOS (site gallery / room photos / interface banners)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
    id           TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'gallery' CHECK (category IN ('gallery','room','banner','history','staff')),
    room_id      TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    caption      TEXT,
    display_order INTEGER DEFAULT 0,
    uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- RULES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rules (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- UPDATES / ANNOUNCEMENTS / NEWS FEED
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS updates (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','occupants','staff')),
    pinned      INTEGER NOT NULL DEFAULT 0,
    posted_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- SITE SETTINGS  (key/value store: description, history, theme, socials)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
    setting_key   TEXT PRIMARY KEY,
    setting_value TEXT,
    updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- MAINTENANCE / TECH SUPPORT TICKETS  (occupants -> tech)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id           TEXT PRIMARY KEY,
    raised_by    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id      TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    assigned_to  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- AUDIT LOG  (security trail of sensitive actions)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,             -- e.g. 'LOGIN_SUCCESS', 'PRICE_UPDATED'
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,                      -- JSON text
    ip_address  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON maintenance_tickets(status);
