const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c || 0;
  const risks = db.prepare(`
    SELECT r.id, r.slug, r.title, r.short_desc, r.detail, r.severity, r.icon,
           (SELECT COUNT(*) FROM clicks WHERE risk_id = r.id) AS total_clicks,
           (SELECT COUNT(DISTINCT user_id) FROM clicks WHERE risk_id = r.id) AS unique_users,
           (SELECT COUNT(*) FROM clicks WHERE risk_id = r.id AND user_id = ?) AS my_clicks
    FROM risks r
    ORDER BY sort_order
  `).all(req.user.id);
  res.json({
    risks,
    totalUsers,
    activeFocusId: global.activeFocusId || 1,
    focusLocked: typeof global.focusLocked === 'boolean' ? global.focusLocked : true
  });
});

module.exports = router;
