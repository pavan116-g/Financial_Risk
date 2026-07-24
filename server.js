const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const riskRoutes = require('./routes/risks');
const clickRoutes = require('./routes/clicks');
const adminRoutes = require('./routes/admin');
const quizRoutes = require('./routes/quiz');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/risks', riskRoutes);
app.use('/api/clicks', clickRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quiz', quizRoutes);

// no-cache on JS/CSS so browsers always pick up the latest build during active iteration
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Any unhandled error in an API route lands here — return JSON instead of
// Express's default HTML error page, which the frontend can't parse as JSON.
app.use('/api', (err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Financial Risk Awareness app running on port ${PORT}`));
