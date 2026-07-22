// Run with: npm run seed
// Creates the first admin & tech accounts plus starter site content.
// CHANGE THESE PASSWORDS IMMEDIATELY AFTER FIRST LOGIN.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

async function seed() {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

  const adminConfig = {
    name: process.env.ADMIN_NAME || 'Site Administrator',
    email: process.env.ADMIN_EMAIL || 'admin@autumngentssuites.com',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe_Admin123!',
  };
  const techConfig = {
    name: process.env.TECH_NAME || 'IT Technician',
    email: process.env.TECH_EMAIL || 'tech@autumngentssuites.com',
    password: process.env.TECH_PASSWORD || 'ChangeMe_Tech123!',
  };

  const adminUser = db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get();
  if (adminUser) {
    const adminHash = await bcrypt.hash(adminConfig.password, saltRounds);
    db.prepare(
      `UPDATE users SET full_name = ?, email = ?, password_hash = ?, status = 'active', email_verified = 1 WHERE id = ?`
    ).run(adminConfig.name, adminConfig.email, adminHash, adminUser.id);
    console.log(`Updated admin: ${adminConfig.email}`);
  } else {
    const adminHash = await bcrypt.hash(adminConfig.password, saltRounds);
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, role, status, email_verified) VALUES (?, ?, ?, ?, 'admin', 'active', 1)`
    ).run(uuidv4(), adminConfig.name, adminConfig.email, adminHash);
    console.log(`Created admin: ${adminConfig.email}`);
  }

  const techUser = db.prepare("SELECT id, email FROM users WHERE role = 'tech' LIMIT 1").get();
  if (techUser) {
    const techHash = await bcrypt.hash(techConfig.password, saltRounds);
    db.prepare(
      `UPDATE users SET full_name = ?, email = ?, password_hash = ?, status = 'active', email_verified = 1 WHERE id = ?`
    ).run(techConfig.name, techConfig.email, techHash, techUser.id);
    console.log(`Updated tech: ${techConfig.email}`);
  } else {
    const techHash = await bcrypt.hash(techConfig.password, saltRounds);
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, role, status, email_verified) VALUES (?, ?, ?, ?, 'tech', 'active', 1)`
    ).run(uuidv4(), techConfig.name, techConfig.email, techHash);
    console.log(`Created tech: ${techConfig.email}`);
  }

  // Default site settings
  const settings = {
    site_name: 'Autumn Gents Suites',
    tagline: "Nairobi's Premier Gentlemen's Hostel",
    description:
      'Autumn Gents Suites is a modern, secure, and affordable hostel built exclusively for working professionals and students. We combine comfortable private and shared rooms with fast Wi-Fi, 24/7 security, and a community-first atmosphere.',
    history:
      'Founded in 2021, Autumn Gents Suites began as a single 12-room building and has since grown into a trusted name in student and professional housing, known for reliability, cleanliness, and a strong sense of community among residents.',
    facebook_url: 'https://facebook.com/autumngentssuites',
    twitter_url: 'https://twitter.com/autumngentssuites',
    instagram_url: 'https://instagram.com/autumngentssuites',
    tiktok_url: 'https://tiktok.com/@autumngentssuites',
    whatsapp_number: '+254700000000',
    owner_social_note: 'Owner: reachable via the official site social pages above.',
    developer_name: 'Site Developer',
    developer_email: process.env.DEVELOPER_EMAIL || 'dev@autumngentssuites.com',
    developer_website: 'https://example-dev-portfolio.com',
    theme_primary: '#0a1128',
    theme_secondary: '#13224d',
    theme_accent: '#c9a34e',
    theme_text: '#e8ecf7',
  };

  const upsert = db.prepare(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT(setting_key) DO NOTHING`
  );
  for (const [k, v] of Object.entries(settings)) upsert.run(k, v);

  // Default rules
  const ruleCount = db.prepare('SELECT COUNT(*) AS c FROM rules').get().c;
  if (ruleCount === 0) {
    const rules = [
      ['Quiet Hours', 'Quiet hours are from 10:00 PM to 6:00 AM. Please be considerate of fellow residents.'],
      ['Visitors', 'Visitors must sign in at the front desk and leave by 9:00 PM.'],
      ['No Smoking', 'Smoking is not permitted inside any building on the premises.'],
      ['Rent Due Date', 'Rent is due on the 5th of every month via the site billing portal.'],
    ];
    const insertRule = db.prepare(`INSERT INTO rules (id, title, content, display_order) VALUES (?, ?, ?, ?)`);
    rules.forEach(([title, content], i) => insertRule.run(uuidv4(), title, content, i));
  }

  // Default location
  const locCount = db.prepare('SELECT COUNT(*) AS c FROM locations').get().c;
  let locationId;
  if (locCount === 0) {
    locationId = uuidv4();
    db.prepare(
      `INSERT INTO locations (id, name, address, city, country, latitude, longitude, description)
       VALUES (?, 'Autumn Gents Suites - Main Branch', 'Ngong Road, near Adams Arcade', 'Nairobi', 'Kenya', -1.3011, 36.7789, 'Our flagship location, 5 minutes from Adams Arcade.')`
    ).run(locationId);
  } else {
    locationId = db.prepare('SELECT id FROM locations LIMIT 1').get().id;
  }

  // Default rooms
  const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
  if (roomCount === 0) {
    const rooms = [
      ['A1', 'single', 1, 12000],
      ['A2', 'double', 2, 8000],
      ['B1', 'shared', 4, 5500],
      ['B2', 'dormitory', 6, 4000],
      ['C1', 'suite', 1, 20000],
    ];
    const insertRoom = db.prepare(
      `INSERT INTO rooms (id, location_id, room_number, room_type, capacity, price_monthly, description) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    rooms.forEach(([num, type, cap, price]) => insertRoom.run(uuidv4(), locationId, num, type, cap, price, `${type} room, sleeps ${cap}.`));
  }

  console.log('Seeding complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
