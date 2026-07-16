const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'db', 'finrisk.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    short_desc TEXT NOT NULL,
    detail TEXT NOT NULL,
    severity TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    risk_id INTEGER NOT NULL REFERENCES risks(id),
    clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_clicks_user ON clicks(user_id);
  CREATE INDEX IF NOT EXISTS idx_clicks_risk ON clicks(risk_id);
`);

try {
  db.exec("ALTER TABLE users ADD COLUMN name TEXT;");
} catch (e) {
  // Column already exists or error, ignore
}

// Seed the 10 risk cards, once
const riskCount = db.prepare('SELECT COUNT(*) c FROM risks').get().c;
if (riskCount === 0) {
  const risks = [
    ['digital-arrest', 'Digital Arrest Scam',
      'Fraudsters pose as police or CBI on video calls, claim you are under "digital arrest," and extort money.',
      'Scammers impersonate law enforcement (police, CBI, customs, RBI) over a video call, alleging a parcel, SIM card, or bank account linked to you is involved in a crime. They claim you are under "digital arrest" and must stay on camera while transferring funds to "clear your name." No Indian law allows arrest over a video call. Hang up, verify independently via the agency\'s official number, and never transfer money under such pressure.',
      'High', '🚔', 1],
    ['stock-market-fraud', 'Stock Market / Trading App Fraud',
      'Fake trading apps and "guaranteed return" stock tips lure victims into depositing money that is never returned.',
      'Victims are added to WhatsApp/Telegram groups promising guaranteed high returns, shown fake profit dashboards on cloned trading apps, and encouraged to invest more. Withdrawals get blocked with demands for "taxes" or "fees." Only trade through SEBI-registered brokers and verify apps on official app stores and SEBI\'s intermediary list.',
      'High', '📈', 2],
    ['upi-payment-fraud', 'UPI / Payment Fraud',
      'Fraudulent payment requests, QR codes, and "wrong transfer" calls trick users into approving debits, not credits.',
      'A common trick: someone sends a UPI collect request or QR code and claims you need to "scan to receive money" — scanning and entering your PIN actually authorizes a payment out of your account. Never enter your UPI PIN to receive money; PINs are only needed to send money.',
      'High', '💳', 3],
    ['phishing-smishing', 'Phishing & Smishing',
      'Fake bank SMS/emails with urgent links harvest login credentials and OTPs.',
      'Messages claiming your account will be "blocked" or KYC has "expired," with a link to a lookalike bank page, are designed to steal your net-banking credentials and OTP. Banks never ask for your PIN, password, or full OTP over SMS, call, or email.',
      'Medium', '🎣', 4],
    ['ponzi-investment', 'Investment / Ponzi Schemes',
      'Unregistered schemes promise fixed high returns, paying early investors with new investors\' money.',
      'These schemes promise unusually high, fixed returns (e.g. 5-10% a month) and pay early investors using money from new investors, collapsing once recruitment slows. Check if the scheme/entity is registered with SEBI or RBI before investing; "guaranteed high returns" is itself a red flag.',
      'Medium', '💰', 5],
    ['loan-app-harassment', 'Loan App Harassment & Fraud',
      'Unregulated instant-loan apps charge hidden fees and use contact-list data to harass borrowers.',
      'Unregistered loan apps grant small instant loans, then charge exorbitant hidden processing fees, and, on delay, harass the borrower and their contacts using data permissions granted during install. Use only RBI-regulated NBFC or bank-linked lending apps, and avoid granting contact/photo access to loan apps.',
      'High', '📱', 6],
    ['kyc-update-scam', 'KYC Update Scam',
      'Calls or messages demanding urgent "KYC update" trick users into sharing OTPs or installing remote-access apps.',
      'Fraudsters call posing as bank or telecom staff, claiming your KYC will expire and your account/SIM will be blocked, then ask you to share an OTP or install a screen-sharing app like AnyDesk to "verify" you — which actually gives them control of your device. KYC updates are done at a branch, official app, or verified portal only.',
      'Medium', '🪪', 7],
    ['job-task-scam', 'Job & Task Scam (Work-From-Home)',
      'Fake "earn from home" task or review jobs ask for upfront deposits that are never returned.',
      'Victims are offered easy online tasks (liking videos, rating products) with small initial payouts to build trust, then asked to deposit increasing amounts to "unlock" bigger tasks or withdrawals, after which the operators vanish. A legitimate job never asks you to pay to work.',
      'Medium', '💼', 8],
    ['sextortion-blackmail', 'Sextortion & Blackmail Scam',
      'Victims are lured into video calls, secretly recorded, then blackmailed with the footage.',
      'A stranger initiates a video call, often on WhatsApp, that turns explicit and is secretly recorded; the victim is then threatened with sharing the recording with contacts unless they pay. Do not pay — payment rarely stops further demands. Block, preserve evidence, and report to cybercrime.gov.in or 1930.',
      'High', '🔒', 9],
    ['sim-swap-fraud', 'SIM Swap Fraud',
      'Fraudsters get a duplicate SIM issued in your number to intercept OTPs and take over bank accounts.',
      'Using leaked personal details, fraudsters convince a telecom outlet to issue a duplicate SIM for your number, disabling your original SIM. They then use OTPs sent to the new SIM to reset banking passwords and drain accounts. Sudden loss of network/signal for an extended period is a warning sign — contact your telecom provider immediately.',
      'High', '🔁', 10],
  ];
  const insert = db.prepare(`INSERT INTO risks (slug, title, short_desc, detail, severity, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction((rows) => rows.forEach(r => insert.run(...r)));
  tx(risks);
}

// Seed or update one admin account to stay synchronized with .env config
const defaultAdminUser = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
const defaultAdminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe123!';
const adminRecord = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();

if (!adminRecord) {
  const hash = bcrypt.hashSync(defaultAdminPass, 10);
  db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`)
    .run(defaultAdminUser, hash);
  console.log('--------------------------------------------------');
  console.log(' Seeded default admin account:');
  console.log(`   username: ${defaultAdminUser}`);
  console.log('--------------------------------------------------');
} else {
  const hash = bcrypt.hashSync(defaultAdminPass, 10);
  db.prepare(`UPDATE users SET username = ?, password_hash = ? WHERE id = ?`)
    .run(defaultAdminUser, hash, adminRecord.id);
  console.log('--------------------------------------------------');
  console.log(' Admin credentials synchronized with .env:');
  console.log(`   username: ${defaultAdminUser}`);
  console.log('--------------------------------------------------');
}

module.exports = db;
