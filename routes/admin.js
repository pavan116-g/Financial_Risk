const express = require('express');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

// Get or set live event presenter focus state
global.activeFocusId = 1;
global.focusLocked = true;

router.get('/event-focus', (req, res) => {
  res.json({
    activeFocusId: global.activeFocusId,
    focusLocked: global.focusLocked
  });
});

router.post('/event-focus', (req, res) => {
  const { activeFocusId, focusLocked } = req.body || {};
  if (typeof activeFocusId === 'number') {
    global.activeFocusId = activeFocusId;
  }
  if (typeof focusLocked === 'boolean') {
    global.focusLocked = focusLocked;
  }
  res.json({ ok: true, activeFocusId: global.activeFocusId, focusLocked: global.focusLocked });
});

// Total clicks per risk card, plus click counts per operator
router.get('/summary', (req, res) => {
  const perRisk = db.prepare(`
    SELECT r.id, r.title, r.icon, r.severity, r.short_desc, r.sort_order,
           COUNT(c.id) AS clicks,
           COUNT(DISTINCT c.user_id) AS unique_readers
     FROM risks r
     LEFT JOIN clicks c ON c.risk_id = r.id AND c.user_id IN (SELECT id FROM users WHERE role = 'user')
     GROUP BY r.id
     ORDER BY r.sort_order
  `).all();

  const perUser = db.prepare(`
    SELECT COALESCE(u.name, u.username) AS name, COUNT(c.id) AS clicks
    FROM users u
    JOIN clicks c ON c.user_id = u.id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY clicks DESC
  `).all();

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
      (SELECT COUNT(*) FROM clicks WHERE user_id IN (SELECT id FROM users WHERE role = 'user')) AS total_clicks,
      (SELECT COUNT(DISTINCT user_id) FROM clicks WHERE user_id IN (SELECT id FROM users WHERE role = 'user')) AS active_users
  `).get();

  res.json({ perRisk, perUser, totals });
});

// Per-user x per-risk matrix, plus each user's most recent activity
router.get('/users-activity', (req, res) => {
  const users = db.prepare(`SELECT id, username, name, created_at FROM users WHERE role = 'user' ORDER BY username`).all();
  const risks = db.prepare(`SELECT id, title, icon FROM risks ORDER BY sort_order`).all();
  const clicks = db.prepare(`SELECT user_id, risk_id, COUNT(*) AS n, MAX(clicked_at) AS last_click
                              FROM clicks GROUP BY user_id, risk_id`).all();

  const matrix = {};
  clicks.forEach(c => {
    matrix[`${c.user_id}-${c.risk_id}`] = { n: c.n, last: c.last_click };
  });

  const lastActivity = db.prepare(`
    SELECT user_id, MAX(clicked_at) AS last_click, COUNT(*) AS total
    FROM clicks GROUP BY user_id
  `).all();
  const lastMap = {};
  lastActivity.forEach(l => { lastMap[l.user_id] = l; });

  res.json({
    users: users.map(u => ({
      ...u,
      total_clicks: lastMap[u.id]?.total || 0,
      last_click: lastMap[u.id]?.last_click || null,
    })),
    risks,
    matrix,
  });
});

// Clicks bucketed by hour for a simple activity timeline (last 7 days)
router.get('/timeline', (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H:00', clicked_at) AS bucket, COUNT(*) AS n
    FROM clicks
    WHERE clicked_at >= datetime('now', '-7 days')
      AND user_id IN (SELECT id FROM users WHERE role = 'user')
    GROUP BY bucket
    ORDER BY bucket
  `).all();
  res.json(rows);
});

// Raw recent click feed, most recent first
router.get('/recent', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, u.username, u.name, r.title AS risk_title, r.icon, c.clicked_at
    FROM clicks c
    JOIN users u ON u.id = c.user_id AND u.role = 'user'
    JOIN risks r ON r.id = c.risk_id
    ORDER BY c.clicked_at DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// Clear all click logs
router.post('/clear-logs', (req, res) => {
  db.prepare('DELETE FROM clicks').run();
  res.json({ ok: true });
});

module.exports = router;
