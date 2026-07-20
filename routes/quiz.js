const express = require('express');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { QUESTION_TIME_LIMIT_MS, MAX_POINTS, MIN_POINTS } = require('../quizConfig');

const router = express.Router();

router.get('/state', verifyToken, (req, res) => {
  const state = global.quizState || { activeQuizId: null, activeQuestionN: 0, phase: 'idle' };
  const { activeQuizId, activeQuestionN, phase, questionStartedAt } = state;

  if (!activeQuizId || phase === 'idle') {
    return res.json({ activeQuizId: null, phase: 'idle' });
  }

  const quiz = db.prepare('SELECT id, title, theme FROM quizzes WHERE id = ?').get(activeQuizId);

  if (phase === 'complete') {
    const myAnswers = db.prepare('SELECT is_correct, points FROM quiz_answers WHERE user_id = ? AND quiz_id = ?')
      .all(req.user.id, activeQuizId);
    const myScore = myAnswers.reduce((sum, a) => sum + a.points, 0);
    const myCorrectCount = myAnswers.reduce((sum, a) => sum + a.is_correct, 0);
    const leaderboard = db.prepare(`
      SELECT COALESCE(u.name, u.username) AS name, SUM(qa.points) AS score
      FROM quiz_answers qa
      JOIN users u ON u.id = qa.user_id AND u.role = 'user'
      WHERE qa.quiz_id = ?
      GROUP BY u.id
      ORDER BY score DESC
      LIMIT 5
    `).all(activeQuizId);
    return res.json({ activeQuizId, phase, quiz, myScore, myCorrectCount, totalAnswered: myAnswers.length, leaderboard });
  }

  const question = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? AND n = ?').get(activeQuizId, activeQuestionN);
  if (!question) return res.json({ activeQuizId: null, phase: 'idle' });

  const options = JSON.parse(question.options_json);
  const myAnswer = db.prepare('SELECT selected_option, is_correct, points FROM quiz_answers WHERE user_id = ? AND quiz_id = ? AND question_n = ?')
    .get(req.user.id, activeQuizId, activeQuestionN);
  const totalQuestions = db.prepare('SELECT MAX(n) m FROM quiz_questions WHERE quiz_id = ?').get(activeQuizId).m || 0;

  const payload = {
    activeQuizId, phase, quiz,
    questionN: activeQuestionN,
    totalQuestions,
    question: question.question,
    options,
    myAnswer: myAnswer ? myAnswer.selected_option : null,
  };

  if (phase === 'voting') {
    payload.questionStartedAt = questionStartedAt;
    payload.timeLimitMs = QUESTION_TIME_LIMIT_MS;
  }

  if (phase === 'revealed') {
    payload.correct = question.correct;
    payload.reveal = question.reveal;
    payload.myCorrect = myAnswer ? !!myAnswer.is_correct : false;
    payload.myPoints = myAnswer ? myAnswer.points : 0;

    const rows = db.prepare(`
      SELECT selected_option, COUNT(*) c FROM quiz_answers
      WHERE quiz_id = ? AND question_n = ? GROUP BY selected_option
    `).all(activeQuizId, activeQuestionN);
    payload.optionCounts = options.map((_, i) => {
      const row = rows.find(r => r.selected_option === i);
      return row ? row.c : 0;
    });
  }

  res.json(payload);
});

router.post('/answer', verifyToken, (req, res) => {
  const { quizId, questionN, selectedOption } = req.body || {};
  const state = global.quizState || {};

  if (state.phase !== 'voting' || state.activeQuizId !== quizId || state.activeQuestionN !== questionN) {
    return res.status(400).json({ error: 'This question is no longer accepting answers' });
  }

  const question = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? AND n = ?').get(quizId, questionN);
  if (!question) return res.status(400).json({ error: 'Unknown question' });

  const options = JSON.parse(question.options_json);
  if (typeof selectedOption !== 'number' || selectedOption < 0 || selectedOption >= options.length) {
    return res.status(400).json({ error: 'Invalid option' });
  }

  const existing = db.prepare('SELECT id FROM quiz_answers WHERE user_id = ? AND quiz_id = ? AND question_n = ?')
    .get(req.user.id, quizId, questionN);
  if (existing) return res.status(409).json({ error: 'Already answered' });

  const isCorrect = selectedOption === question.correct ? 1 : 0;

  let points = 0;
  if (isCorrect) {
    const elapsedMs = Math.max(0, Date.now() - (state.questionStartedAt || Date.now()));
    const remainingFraction = Math.max(0, Math.min(1, 1 - elapsedMs / QUESTION_TIME_LIMIT_MS));
    points = Math.round(MIN_POINTS + (MAX_POINTS - MIN_POINTS) * remainingFraction);
  }

  db.prepare(`INSERT INTO quiz_answers (user_id, quiz_id, question_n, selected_option, is_correct, points)
    VALUES (?, ?, ?, ?, ?, ?)`).run(req.user.id, quizId, questionN, selectedOption, isCorrect, points);

  res.status(201).json({ ok: true });
});

module.exports = router;
