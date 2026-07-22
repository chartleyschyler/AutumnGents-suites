const nodemailer = require('nodemailer');

// This transporter sends mail FROM the site's own mailbox
// (SITE_EMAIL_ADDRESS). You must create that mailbox with a real
// provider (Zoho Mail, Google Workspace, etc.) and put its SMTP
// credentials in .env before this will actually send anything.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('replace')) {
    console.warn(`[email skipped - SMTP not configured] Would send "${subject}" to ${to}`);
    return { skipped: true };
  }
  return transporter.sendMail({
    from: `"Autumn Gents Suites" <${process.env.SITE_EMAIL_ADDRESS}>`,
    to,
    subject,
    text,
    html,
  });
}

const templates = {
  welcomeOccupant: (name, roomNumber) => ({
    subject: 'Welcome to Autumn Gents Suites',
    html: `<div style="font-family:Arial,sans-serif;background:#0a1128;color:#e8ecf7;padding:24px">
      <h2 style="color:#c9a34e">Welcome, ${name}!</h2>
      <p>Your account at <strong>Autumn Gents Suites</strong> is active. You've been assigned room <strong>${roomNumber || 'TBA'}</strong>.</p>
      <p>Log in any time to view rules, updates, and pay your accommodation fee.</p>
      <p style="color:#8a93ab;font-size:12px;margin-top:32px">Autumn Gents Suites</p>
    </div>`,
  }),
  paymentReceipt: (name, amount, currency, period) => ({
    subject: 'Payment Receipt - Autumn Gents Suites',
    html: `<div style="font-family:Arial,sans-serif;background:#0a1128;color:#e8ecf7;padding:24px">
      <h2 style="color:#c9a34e">Payment Received</h2>
      <p>Hi ${name}, we've received your payment of <strong>${currency} ${amount}</strong> for ${period || 'your accommodation'}.</p>
      <p>Thank you for staying with Autumn Gents Suites.</p>
    </div>`,
  }),
  passwordReset: (name, resetLink) => ({
    subject: 'Password Reset - Autumn Gents Suites',
    html: `<div style="font-family:Arial,sans-serif;background:#0a1128;color:#e8ecf7;padding:24px">
      <h2 style="color:#c9a34e">Reset your password</h2>
      <p>Hi ${name}, click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetLink}" style="color:#c9a34e">${resetLink}</a></p>
      <p>If you didn't request this, ignore this email.</p>
    </div>`,
  }),
};

module.exports = { sendMail, templates };
