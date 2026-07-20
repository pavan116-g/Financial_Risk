const API = '';
let mode = 'login'; // or 'register'

const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const authForm = document.getElementById('authForm');
const authError = document.getElementById('authError');
const authTitle = document.getElementById('authTitle');
const authSub = document.getElementById('authSub');
const authSubmit = document.getElementById('authSubmit');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
const whoami = document.getElementById('whoami');
const whoamiAvatar = document.getElementById('whoamiAvatar');
const feed = document.getElementById('feed');
const logoutBtn = document.getElementById('logoutBtn');

function setMode(next) {
  mode = next;
  authError.classList.add('hidden');
  const nameField = document.getElementById('nameField');
  const nameInput = document.getElementById('nameInput');
  const usernameHint = document.getElementById('usernameHint');
  const usernameInput = document.getElementById('username');
  if (mode === 'login') {
    authTitle.textContent = 'Agent Login';
    authSub.textContent = 'Authenticate to initialize secure access to the threat database.';
    authSubmit.textContent = 'Sign in';
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    if (nameField) nameField.classList.add('hidden');
    if (nameInput) nameInput.required = false;
    if (usernameHint) usernameHint.classList.add('hidden');
    if (usernameInput) usernameInput.removeAttribute('pattern');
  } else {
    authTitle.textContent = 'New Recruit Registration';
    authSub.textContent = 'Set up your own login to start exploring risk cards.';
    authSubmit.textContent = 'Create account';
    tabLoginBtn.classList.remove('active');
    tabRegisterBtn.classList.add('active');
    if (nameField) nameField.classList.remove('hidden');
    if (nameInput) nameInput.required = true;
    if (usernameHint) usernameHint.classList.remove('hidden');
    if (usernameInput) usernameInput.setAttribute('pattern', '[a-zA-Z0-9_]{3,20}');
  }
}

tabLoginBtn.addEventListener('click', () => setMode('login'));
tabRegisterBtn.addEventListener('click', () => setMode('register'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authSubmit.disabled = true;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const name = document.getElementById('nameInput') ? document.getElementById('nameInput').value.trim() : '';

  try {
    const res = await fetch(`${API}/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    localStorage.setItem('rw_token', data.token);
    localStorage.setItem('rw_username', data.username);
    localStorage.setItem('rw_role', data.role);
    enterApp();
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  } finally {
    authSubmit.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('rw_token');
  localStorage.removeItem('rw_username');
  localStorage.removeItem('rw_role');
  location.reload();
});

async function enterApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  const username = localStorage.getItem('rw_username') || '';
  whoami.textContent = username;
  if (whoamiAvatar) whoamiAvatar.textContent = username.charAt(0).toUpperCase();
  await loadRisks();

  // High-frequency polling to check presenter focus updates during live event
  setInterval(loadRisks, 3000);

  await pollQuizState();
  setInterval(pollQuizState, 2000);
}

async function loadRisks() {
  const token = localStorage.getItem('rw_token');
  try {
    const res = await fetch(`${API}/api/risks`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return logoutBtn.click();
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to fetch risks');
    }
    const data = await res.json();
    
    let risksList = [];
    let totalUsersCount = 0;
    
    if (Array.isArray(data)) {
      risksList = data;
    } else if (data && data.risks) {
      risksList = data.risks;
      totalUsersCount = data.totalUsers || 0;
    }
    
    const activeFocusId = data.activeFocusId || 1;
    const focusLocked = typeof data.focusLocked === 'boolean' ? data.focusLocked : true;

    // Build feed ONLY on first load so we don't collapse open cards
    if (feed.children.length === 0) {
      risksList.forEach(r => {
        const card = renderCard(r, totalUsersCount);
        feed.appendChild(card);
      });
    } else {
      // Sync click statistics tallies on existing DOM nodes
      risksList.forEach(r => {
        const card = feed.querySelector(`.risk-card[data-risk-id="${r.id}"]`);
        if (card) {
          const uniqueUsers = r.unique_users || 0;
          const totalClicks = r.total_clicks || 0;
          const pct = totalUsersCount > 0 ? Math.round((uniqueUsers / totalUsersCount) * 100) : 0;
          
          const scanText = card.querySelector('.stats-header span:last-child');
          if (scanText) scanText.textContent = `${uniqueUsers} of ${totalUsersCount} scanned`;
          
          const bar = card.querySelector('.stats-bar-fill');
          if (bar) bar.style.width = `${pct}%`;
          
          const tallyText = card.querySelector('.stats-footer span:last-child');
          if (tallyText) tallyText.textContent = `${totalClicks} scans`;
        }
      });
    }

    // Apply Presenter Focus Locks
    updateCardsLockedState(activeFocusId, focusLocked);
  } catch (err) {
    if (feed.children.length === 0) {
      feed.innerHTML = `<div class="error-msg" style="margin: 20px;">Failed to load risks: ${err.message}. Please restart the backend server and refresh.</div>`;
    }
  }
}

function renderCard(risk, totalUsers) {
  const uniqueUsers = risk.unique_users || 0;
  const totalClicks = risk.total_clicks || 0;
  const pct = totalUsers > 0 ? Math.round((uniqueUsers / totalUsers) * 100) : 0;
  
  const el = document.createElement('div');
  el.className = 'risk-card';
  el.setAttribute('data-risk-id', risk.id);
  el.innerHTML = `
    <div class="risk-icon">${risk.icon}</div>
    <div class="risk-body">
      <div class="risk-top">
        <div class="risk-title">${risk.title}</div>
        <div class="severity-tag ${risk.severity}">${risk.severity}</div>
      </div>
      <p class="risk-short">${risk.short_desc}</p>
      <div class="risk-detail">
        ${risk.detail}
        <div class="risk-stats ${totalUsers === 0 ? 'hidden' : ''}">
          <div class="stats-header">
            <span>Defense Coverage</span>
            <span>${uniqueUsers} of ${totalUsers} scanned</span>
          </div>
          <div class="stats-bar-bg">
            <div class="stats-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="stats-footer">
            <span>System Scan Telemetry</span>
            <span>${totalClicks} scans</span>
          </div>
        </div>
      </div>
      <div class="tap-hint">Initiate Scan</div>
    </div>
  `;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.risk-detail')) return;
    if (el.classList.contains('locked')) return; // Block clicks on locked cards
    
    const wasOpen = el.classList.contains('open');
    el.classList.toggle('open');
    const hint = el.querySelector('.tap-hint');
    
    if (!wasOpen) {
      if (hint) hint.textContent = 'Close Dossier';
      trackClick(risk.id);
    } else {
      if (hint) hint.textContent = 'Initiate Scan';
    }
  });
  return el;
}

function updateCardsLockedState(activeFocusId, focusLocked) {
  const cards = feed.querySelectorAll('.risk-card');
  cards.forEach(card => {
    const riskId = parseInt(card.getAttribute('data-risk-id'));
    const hint = card.querySelector('.tap-hint');
    const isLocked = focusLocked && (riskId !== activeFocusId);
    
    if (isLocked) {
      card.classList.add('locked');
      card.classList.remove('open');
      if (hint) {
        hint.innerHTML = `<span style="color:var(--danger); font-weight:600;">🔒 Locked by Commander</span>`;
      }
    } else {
      card.classList.remove('locked');
      if (hint) {
        if (card.classList.contains('open')) {
          hint.textContent = 'Close Dossier';
        } else {
          hint.textContent = 'Initiate Scan';
        }
      }
    }
  });
}

async function trackClick(riskId) {
  const token = localStorage.getItem('rw_token');
  try {
    await fetch(`${API}/api/clicks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ riskId }),
    });
  } catch (e) { /* non-blocking */ }
}

// ---------- Live Quiz ----------
const quizOverlay = document.getElementById('quizOverlay');
const quizTheme = document.getElementById('quizTheme');
const quizProgress = document.getElementById('quizProgress');
const quizBody = document.getElementById('quizBody');
const quizTimerWrap = document.getElementById('quizTimerWrap');
const quizTimerFill = document.getElementById('quizTimerFill');
const quizTimerText = document.getElementById('quizTimerText');

let quizSubmitting = false;
let dismissedQuizKey = null; // "quizId" the operator manually closed after completion
let quizRenderKey = null; // dedupes re-renders so we only animate on real content changes
let quizTimer = { active: false, questionStartedAt: null, timeLimitMs: null };

// Smooth per-frame countdown, decoupled from the (slower) polling interval
setInterval(() => {
  if (!quizTimer.active) return;
  const remainingMs = Math.max(0, quizTimer.questionStartedAt + quizTimer.timeLimitMs - Date.now());
  const pct = Math.max(0, Math.min(100, (remainingMs / quizTimer.timeLimitMs) * 100));
  quizTimerFill.style.width = `${pct}%`;
  quizTimerText.textContent = `${Math.ceil(remainingMs / 1000)}s`;
  quizTimerFill.classList.toggle('low', remainingMs <= 5000);
}, 200);

async function pollQuizState() {
  const token = localStorage.getItem('rw_token');
  try {
    const res = await fetch(`${API}/api/quiz/state`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    renderQuiz(data);
  } catch (e) { /* non-blocking */ }
}

function playQuizEnterAnimation() {
  quizBody.classList.remove('quiz-anim-in');
  void quizBody.offsetWidth; // force reflow so the animation restarts
  quizBody.classList.add('quiz-anim-in');
}

function renderQuiz(data) {
  if (!data.activeQuizId || data.phase === 'idle') {
    quizOverlay.classList.add('hidden');
    quizRenderKey = null;
    quizTimer.active = false;
    return;
  }

  if (data.phase === 'complete' && dismissedQuizKey === data.activeQuizId) {
    quizOverlay.classList.add('hidden');
    quizTimer.active = false;
    return;
  }

  quizOverlay.classList.remove('hidden');
  quizTheme.textContent = data.quiz ? data.quiz.theme : 'Live Quiz';
  quizProgress.textContent = data.phase === 'complete' ? 'Complete' : `Question ${data.questionN} of ${data.totalQuestions}`;

  if (data.phase === 'voting' && data.questionStartedAt) {
    quizTimer = { active: true, questionStartedAt: data.questionStartedAt, timeLimitMs: data.timeLimitMs || 20000 };
    quizTimerWrap.classList.remove('hidden');
  } else {
    quizTimer.active = false;
    quizTimerWrap.classList.add('hidden');
  }

  // Skip re-rendering (and re-animating) when nothing about the visible content actually changed
  const key = `${data.activeQuizId}|${data.phase}|${data.questionN || ''}|${data.myAnswer}`;
  if (key === quizRenderKey) return;
  quizRenderKey = key;

  if (data.phase === 'complete') {
    renderQuizComplete(data);
  } else if (data.phase === 'voting') {
    renderQuizVoting(data);
  } else if (data.phase === 'revealed') {
    renderQuizRevealed(data);
  }
  playQuizEnterAnimation();
}

function renderQuizVoting(data) {
  if (data.myAnswer !== null) {
    quizBody.innerHTML = `
      <p class="quiz-question">${data.question}</p>
      <div class="quiz-locked">
        <span class="quiz-locked-check">✅</span>
        Locked in. Waiting for reveal...
      </div>
    `;
    return;
  }

  quizBody.innerHTML = `
    <p class="quiz-question">${data.question}</p>
    <div class="quiz-options">
      ${data.options.map((opt, i) => `
        <button class="quiz-option" data-option="${i}">${opt}</button>
      `).join('')}
    </div>
  `;

  quizBody.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (quizSubmitting) return;
      quizSubmitting = true;
      quizBody.querySelectorAll('.quiz-option').forEach(b => b.disabled = true);
      btn.classList.add('picked');
      try {
        await submitQuizAnswer(data.activeQuizId, data.questionN, parseInt(btn.getAttribute('data-option')));
      } finally {
        quizSubmitting = false;
        pollQuizState();
      }
    });
  });
}

async function submitQuizAnswer(quizId, questionN, selectedOption) {
  const token = localStorage.getItem('rw_token');
  try {
    await fetch(`${API}/api/quiz/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quizId, questionN, selectedOption }),
    });
  } catch (e) { /* non-blocking */ }
}

function renderQuizRevealed(data) {
  const totalVotes = data.optionCounts.reduce((a, b) => a + b, 0) || 1;
  quizBody.innerHTML = `
    <p class="quiz-question">${data.question}</p>
    ${data.myAnswer !== null ? `<div class="quiz-points-earned ${data.myCorrect ? 'positive' : ''}">${data.myCorrect ? `+${data.myPoints} points` : 'No points this round'}</div>` : ''}
    <div class="quiz-results">
      ${data.options.map((opt, i) => {
        const count = data.optionCounts[i] || 0;
        const pct = Math.round((count / totalVotes) * 100);
        const isCorrect = i === data.correct;
        const isMine = i === data.myAnswer;
        return `
          <div class="quiz-result-row ${isCorrect ? 'correct' : ''} ${isMine && !isCorrect ? 'wrong' : ''}">
            <div class="quiz-result-label">
              <span>${opt} ${isCorrect ? '✅' : ''} ${isMine && !isCorrect ? '(your pick)' : ''}</span>
              <span>${count} · ${pct}%</span>
            </div>
            <div class="quiz-result-bar-bg"><div class="quiz-result-bar-fill" data-target-width="${pct}"></div></div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="quiz-reveal-text">${data.reveal}</div>
    <div class="quiz-waiting">Waiting for the next question...</div>
  `;
  // Animate bars growing in from 0 instead of snapping to their final width
  requestAnimationFrame(() => {
    quizBody.querySelectorAll('.quiz-result-bar-fill').forEach(el => {
      el.style.width = `${el.getAttribute('data-target-width')}%`;
    });
  });
}

function renderQuizComplete(data) {
  quizBody.innerHTML = `
    <p class="quiz-question">Quiz Complete!</p>
    <div class="quiz-score">${data.myScore} pts</div>
    <div class="quiz-score-sub">${data.myCorrectCount} of ${data.totalAnswered} correct</div>
    ${data.leaderboard && data.leaderboard.length ? `
      <div class="quiz-leaderboard">
        <div class="quiz-leaderboard-title">Top Scores</div>
        ${data.leaderboard.map((l, i) => `
          <div class="quiz-leaderboard-row">
            <span>#${i + 1} ${l.name}</span>
            <span>${l.score} pts</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <button class="btn-primary" id="quizCloseBtn" style="margin-top:16px;">Close</button>
  `;
  const closeBtn = document.getElementById('quizCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      dismissedQuizKey = data.activeQuizId;
      quizOverlay.classList.add('hidden');
    });
  }
}

// Boot
(function init() {
  setMode('login');
  const token = localStorage.getItem('rw_token');
  if (token) {
    enterApp();
  }
})();
