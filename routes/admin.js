const express = require('express');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { QUESTION_TIME_LIMIT_MS, REVEAL_PAUSE_MS } = require('../quizConfig');

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

// Live Mentimeter-style quiz control state
// phase: idle | voting | revealed | complete
global.quizState = { activeQuizId: null, activeQuestionN: 0, phase: 'idle', questionStartedAt: null, revealedAt: null };

// The quiz paces itself once launched: a voting window auto-reveals, which auto-advances —
// the admin's buttons just let a presenter skip a step early if they want to.
let quizAutoTimer = null;
function clearQuizAutoTimer() {
  if (quizAutoTimer) {
    clearTimeout(quizAutoTimer);
    quizAutoTimer = null;
  }
}

function revealActiveQuestion() {
  clearQuizAutoTimer();
  if (!global.quizState.activeQuizId || global.quizState.phase !== 'voting') return;
  global.quizState.phase = 'revealed';
  global.quizState.revealedAt = Date.now();
  quizAutoTimer = setTimeout(advanceActiveQuestion, REVEAL_PAUSE_MS);
}

function advanceActiveQuestion() {
  clearQuizAutoTimer();
  const { activeQuizId, activeQuestionN } = global.quizState;
  if (!activeQuizId) return;
  const maxN = db.prepare('SELECT MAX(n) m FROM quiz_questions WHERE quiz_id = ?').get(activeQuizId).m || 0;
  if (activeQuestionN < maxN) {
    global.quizState.activeQuestionN += 1;
    global.quizState.phase = 'voting';
    global.quizState.questionStartedAt = Date.now();
    global.quizState.revealedAt = null;
    quizAutoTimer = setTimeout(revealActiveQuestion, QUESTION_TIME_LIMIT_MS);
  } else {
    global.quizState.phase = 'complete';
    global.quizState.revealedAt = null;
  }
}

router.get('/quiz-state', (req, res) => {
  const quizzes = db.prepare('SELECT id, title, theme FROM quizzes ORDER BY sort_order').all();
  res.json({ ...global.quizState, timeLimitMs: QUESTION_TIME_LIMIT_MS, revealPauseMs: REVEAL_PAUSE_MS, quizzes });
});

router.post('/quiz-control', (req, res) => {
  const { action, quizId } = req.body || {};

  if (action === 'launch') {
    const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
    if (!quiz) return res.status(400).json({ error: 'Unknown quiz id' });
    // Launching a quiz starts a fresh live round — clear any answers left over from a prior run
    // (a previous live session, or someone trying it out beforehand) so voting starts at zero.
    db.prepare('DELETE FROM quiz_answers WHERE quiz_id = ?').run(quizId);
    clearQuizAutoTimer();
    global.quizState = { activeQuizId: quizId, activeQuestionN: 1, phase: 'voting', questionStartedAt: Date.now(), revealedAt: null };
    quizAutoTimer = setTimeout(revealActiveQuestion, QUESTION_TIME_LIMIT_MS);
  } else if (action === 'reveal') {
    if (!global.quizState.activeQuizId || global.quizState.phase !== 'voting') {
      return res.status(400).json({ error: 'No question currently open for voting' });
    }
    revealActiveQuestion();
  } else if (action === 'next') {
    if (!global.quizState.activeQuizId) return res.status(400).json({ error: 'No active quiz' });
    advanceActiveQuestion();
  } else if (action === 'end') {
    clearQuizAutoTimer();
    global.quizState = { activeQuizId: null, activeQuestionN: 0, phase: 'idle', questionStartedAt: null, revealedAt: null };
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  res.json({ ok: true, ...global.quizState });
});

// Live per-option vote tally for the currently active question (or final leaderboard once complete)
router.get('/quiz-live', (req, res) => {
  const { activeQuizId, activeQuestionN, phase, questionStartedAt, revealedAt } = global.quizState;
  if (!activeQuizId) return res.json({ activeQuizId: null });

  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c || 0;

  if (phase === 'complete') {
    const leaderboard = db.prepare(`
      SELECT COALESCE(u.name, u.username) AS name,
             COUNT(*) AS answered,
             SUM(qa.points) AS score,
             SUM(qa.is_correct) AS correctCount
      FROM quiz_answers qa
      JOIN users u ON u.id = qa.user_id AND u.role = 'user'
      WHERE qa.quiz_id = ?
      GROUP BY u.id
      ORDER BY score DESC, answered DESC
    `).all(activeQuizId);
    return res.json({ activeQuizId, activeQuestionN, phase, totalUsers, leaderboard });
  }

  const question = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? AND n = ?').get(activeQuizId, activeQuestionN);
  if (!question) return res.json({ activeQuizId, activeQuestionN, phase, totalUsers, optionCounts: [], answered: 0 });

  const options = JSON.parse(question.options_json);
  const rows = db.prepare(`
    SELECT selected_option, COUNT(*) c FROM quiz_answers
    WHERE quiz_id = ? AND question_n = ?
    GROUP BY selected_option
  `).all(activeQuizId, activeQuestionN);

  const optionCounts = options.map((_, i) => {
    const row = rows.find(r => r.selected_option === i);
    return row ? row.c : 0;
  });
  const answered = optionCounts.reduce((a, b) => a + b, 0);

  res.json({
    activeQuizId, activeQuestionN, phase, totalUsers,
    questionStartedAt, timeLimitMs: QUESTION_TIME_LIMIT_MS,
    revealedAt, revealPauseMs: REVEAL_PAUSE_MS,
    question: question.question, options, correct: question.correct, reveal: question.reveal,
    optionCounts, answered
  });
});

// Post-event results: per-question accuracy + per-user scores for a given quiz
router.get('/quiz-results', (req, res) => {
  const quizId = req.query.quizId;
  const quiz = db.prepare('SELECT id, title, theme FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(400).json({ error: 'Unknown quiz id' });

  const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY n').all(quizId);
  const answerRows = db.prepare('SELECT question_n, selected_option, is_correct FROM quiz_answers WHERE quiz_id = ?').all(quizId);

  const perQuestion = questions.map(q => {
    const options = JSON.parse(q.options_json);
    const answersForQ = answerRows.filter(a => a.question_n === q.n);
    const optionCounts = options.map((_, i) => answersForQ.filter(a => a.selected_option === i).length);
    const correctCount = answersForQ.filter(a => a.is_correct).length;
    return {
      n: q.n, question: q.question, options, correct: q.correct,
      answered: answersForQ.length,
      optionCounts,
      pctCorrect: answersForQ.length ? Math.round((correctCount / answersForQ.length) * 100) : 0
    };
  });

  const perUser = db.prepare(`
    SELECT COALESCE(u.name, u.username) AS name, COUNT(*) AS answered,
           SUM(qa.points) AS score, SUM(qa.is_correct) AS correctCount
    FROM quiz_answers qa
    JOIN users u ON u.id = qa.user_id AND u.role = 'user'
    WHERE qa.quiz_id = ?
    GROUP BY u.id
    ORDER BY score DESC, answered DESC
  `).all(quizId);

  res.json({ quiz, perQuestion, perUser, totalQuestions: questions.length });
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
  const users = db.prepare(`SELECT id, username, name, role, password_hash, created_at FROM users WHERE role = 'user' ORDER BY username`).all();
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

// Remove a registered operator (and their click history). Admin accounts cannot be removed this way.
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be removed here' });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM clicks WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM quiz_answers WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  tx();

  res.json({ ok: true });
});

module.exports = router;
