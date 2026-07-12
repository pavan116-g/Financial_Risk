const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/register', (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (name && name.trim().length === 0) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'user')`)
    .run(username, name ? name.trim() : null, hash);

  const token = jwt.sign({ id: info.lastInsertRowid, username, role: 'user' }, SECRET, { expiresIn: '12h' });
  res.status(201).json({ token, username, role: 'user' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '12h' });
  res.json({ token, username: user.username, role: user.role });
});

module.exports = router;
