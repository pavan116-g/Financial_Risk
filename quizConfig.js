module.exports = {
  QUESTION_TIME_LIMIT_MS: 35000, // voting window per question — answers are rejected once this elapses
  REVEAL_PAUSE_MS: 6000, // how long the answer/results stay up before auto-advancing
  MAX_POINTS: 1000,
  MIN_POINTS: 500, // floor for a correct answer, however late it lands
};
