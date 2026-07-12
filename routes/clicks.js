const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, (req, res) => {
  const { riskId } = req.body || {};
  const risk = db.prepare('SELECT id FROM risks WHERE id = ?').get(riskId);
  if (!risk) return res.status(400).json({ error: 'Unknown risk id' });

  db.prepare('INSERT INTO clicks (user_id, risk_id) VALUES (?, ?)').run(req.user.id, riskId);
  res.status(201).json({ ok: true });
});

module.exports = router;
