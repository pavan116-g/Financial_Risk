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
    ['digital-arrest', 'The Digital Arrest',
      'Fraudsters pose as police or CBI on video calls, claim you are under "digital arrest," and extort money.',
      'Scammers impersonate law enforcement (police, CBI, customs, RBI) over a video call, alleging a parcel, SIM card, or bank account linked to you is involved in a crime. They claim you are under "digital arrest" and must stay on camera while transferring funds to "clear your name." No Indian law allows arrest over a video call. Hang up, verify independently via the agency\'s official number, and never transfer money under such pressure.',
      'High', '🚔', 1],
    ['impersonation-playbook', 'The Impersonation Playbook',
      'Fake KYC calls, phishing/smishing links, OTP requests, and impersonation of bank or telecom staff — all designed to steal your credentials.',
      'Fraudsters call or message posing as bank, telecom, or government staff, claiming your KYC has expired or your account will be blocked. Fake SMS/emails with urgent links (smishing/phishing) lead to lookalike bank pages that harvest login credentials and OTPs, or ask you to install a screen-sharing app like AnyDesk to "verify" you. Banks never ask for your PIN, password, or full OTP over SMS, call, or email — KYC updates are done at a branch, official app, or verified portal only.',
      'High', '🎣', 2],
    ['money-gone-in-one-tap', 'Money Gone in One Tap',
      'Fraudulent UPI collect requests, QR codes, and malicious APK files trick users into approving debits or installing spyware.',
      'A common trick: someone sends a UPI collect request or QR code and claims you need to "scan to receive money" — scanning and entering your PIN actually authorizes a payment out of your account. Similarly, fraudsters send APK files disguised as delivery, KYC, or reward apps; installing them grants access to SMS, screen, and banking data. Never enter your UPI PIN to receive money, and never install APK files shared outside official app stores.',
      'High', '💳', 3],
    ['ai-voice-call', 'The AI Voice Call',
      'AI-cloned voices of family or friends are used in urgent calls to trick victims into sending money immediately.',
      'Fraudsters use AI voice-cloning tools, often built from a few seconds of publicly available audio, to impersonate a family member or friend in distress, urgently requesting money for an emergency (accident, arrest, hospital). The panic and urgency are designed to bypass verification. Always hang up and call the person back directly on their known number before sending any money.',
      'High', '🤖', 4],
    ['telegram-tip', 'The Telegram Tip',
      'Victims are added to Telegram groups offering "easy task" jobs or investment tips that demand upfront payments.',
      'Victims are added to Telegram/WhatsApp groups promising quick earnings from simple tasks (liking videos, rating products) or "insider" investment tips. Small initial payouts build trust, then victims are asked to deposit increasing amounts to "unlock" bigger tasks or withdrawals, after which the operators vanish. A legitimate opportunity never asks you to pay to earn.',
      'Medium', '📲', 5],
    ['ponzi-and-betting-app', 'The Ponzi and the Betting App',
      'Unregistered investment schemes and betting/gaming apps promise guaranteed returns while paying out with new victims\' money.',
      'Ponzi schemes promise unusually high, fixed returns and pay early investors using money from new investors, collapsing once recruitment slows. Fake betting and gaming apps operate similarly, showing early wins to build confidence before blocking withdrawals. Check if a scheme or entity is registered with SEBI or RBI before investing; "guaranteed returns" is itself a red flag.',
      'Medium', '💰', 6],
    ['sim-swap', 'The SIM Swap',
      'Fraudsters get a duplicate SIM issued in your number to intercept OTPs and take over bank accounts.',
      'Using leaked personal details, fraudsters convince a telecom outlet to issue a duplicate SIM for your number, disabling your original SIM. They then use OTPs sent to the new SIM to reset banking passwords and drain accounts. Sudden loss of network/signal for an extended period is a warning sign — contact your telecom provider immediately.',
      'High', '🔁', 7],
    ['visa-consultancy', 'The Visa Consultancy',
      'Fake visa and overseas job consultancies charge large upfront fees for visas, jobs, or admissions that never materialize.',
      'Fraudulent consultancies advertise guaranteed visas, overseas jobs, or foreign university admissions, collecting large processing fees, forged documents, or "guarantee deposits" upfront. Once paid, the consultancy becomes unreachable or the visa/job application is rejected due to fraudulent paperwork. Verify consultancies through official embassy or government-licensed agent lists before paying any fee.',
      'Medium', '🛂', 8],
    ['fake-storefront', 'The Fake Storefront',
      'Fraudulent e-commerce sites and social media stores advertise heavily discounted products that are never delivered.',
      'Fake online stores, often promoted via social media ads, list popular products at steep discounts and demand full payment upfront. Orders are never shipped, or cheap counterfeits arrive instead, and the store disappears or stops responding to complaints. Buy from verified marketplaces, check seller reviews and site legitimacy, and prefer cash-on-delivery or payment protection where possible.',
      'Medium', '🛒', 9],
    ['insider-you-trust', 'The Insider You Trust',
      'Family members, friends, or colleagues misuse trust and access to commit financial fraud from the inside.',
      'Not all fraud comes from strangers — a trusted family member, friend, employee, or colleague with access to accounts, passwords, or documents can misuse that access for unauthorized transactions or identity theft. Limit shared access to financial credentials, monitor account activity regularly, and treat unusual requests from trusted contacts with the same caution as those from strangers.',
      'High', '🗝️', 10],
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
