const API = '';

const desktopGate = document.getElementById('desktopGate');
const loginWrap = document.getElementById('loginWrap');
const dashWrap = document.getElementById('dashWrap');

function checkViewport() {
  const isNarrow = window.innerWidth < 1000;
  desktopGate.classList.toggle('hidden', !isNarrow);
  const signedIn = !!localStorage.getItem('rw_admin_token');
  loginWrap.classList.toggle('hidden', isNarrow || signedIn);
  dashWrap.classList.toggle('hidden', isNarrow || !signedIn);
}
window.addEventListener('resize', checkViewport);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  const username = document.getElementById('adminUser').value.trim();
  const password = document.getElementById('adminPass').value;
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (data.role !== 'admin') throw new Error('This account does not have admin access');
    localStorage.setItem('rw_admin_token', data.token);
    localStorage.setItem('rw_admin_username', data.username);
    checkViewport();
    boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

document.getElementById('adminLogout').addEventListener('click', () => {
  localStorage.removeItem('rw_admin_token');
  localStorage.removeItem('rw_admin_username');
  location.reload();
});

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('rw_admin_token')}` };
}

let riskChart;
let cachedUsers = [];
let cachedRisks = [];
let cachedMatrix = {};
let currentActiveRiskId = 1;

async function boot() {
  document.getElementById('adminWhoami').textContent = localStorage.getItem('rw_admin_username');
  await Promise.all([loadSummary(), loadUsers(), loadRecent(), loadEventFocusState(), loadQuizState()]);
  setupEventFocusListeners();
  setupQuizControlListeners();
}

async function loadSummary() {
  const res = await fetch(`${API}/api/admin/summary`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return document.getElementById('adminLogout').click();
  const { perRisk, perUser, totals } = await res.json();

  // Populate Event Focus Dropdown once
  const eventFocusSelect = document.getElementById('eventFocusSelect');
  if (eventFocusSelect && eventFocusSelect.children.length === 0) {
    eventFocusSelect.innerHTML = perRisk.map(r => `
      <option value="${r.id}">${r.icon} ${r.title}</option>
    `).join('');
    eventFocusSelect.value = currentActiveRiskId;
  }

  document.getElementById('kpiScans').textContent = totals.total_clicks;
  document.getElementById('kpiVectors').textContent = perRisk.length;

  // Populate Risk Cards Directory Tab Table
  const risksTabTbody = document.getElementById('tabRisksTableBody');
  if (risksTabTbody) {
    risksTabTbody.innerHTML = perRisk.map(r => `
      <tr>
        <td><span style="font-size:1.2rem; margin-right:8px;">${r.icon}</span> <strong>${r.title}</strong></td>
        <td><span class="pill ${r.severity}">${r.severity}</span></td>
        <td style="color:var(--text-dim); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.short_desc}">${r.short_desc}</td>
        <td style="font-weight: 600; color:var(--accent);">${r.clicks}</td>
        <td>${r.unique_readers}</td>
        <td class="mono">${r.sort_order}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="color:var(--text-dim);">No risk cards available.</td></tr>`;
  }

  const ctx = document.getElementById('riskChart');
  const chartLabels = perUser.map(u => u.name);
  const chartData = perUser.map(u => u.clicks);
  
  // Mission Impossible red/amber ops palette
  const segmentColors = ['#ff0033', '#ffb300', '#ff3355', '#cc0029', '#ff8800', '#e6002e', '#ffcc00', '#99001f', '#ff5500', '#b30000'];
  const data = {
    labels: chartLabels,
    datasets: [{
      data: chartData,
      backgroundColor: chartLabels.map((_, i) => segmentColors[i % segmentColors.length]),
      borderColor: '#140303',
      borderWidth: 2,
    }],
  };
  if (riskChart) { riskChart.data = data; riskChart.update(); return; }
  riskChart = new Chart(ctx, {
    type: 'polarArea',
    data,
    options: {
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const name = chartLabels[index];
          showOperatorScenarios(name);
        }
      },
      scales: {
        r: {
          grid: { color: 'rgba(255, 0, 51, 0.15)' },
          angleLines: { color: 'rgba(255, 0, 51, 0.15)' },
          ticks: { display: false }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { color: '#f5f5f5', font: { family: 'IBM Plex Mono', size: 11 } }
        }
      },
      responsive: true,
      maintainAspectRatio: false
    },
  });
}

async function loadUsers() {
  const res = await fetch(`${API}/api/admin/users-activity`, { headers: authHeaders() });
  const data = await res.json();
  cachedUsers = data.users || [];
  cachedRisks = data.risks || [];
  cachedMatrix = data.matrix || {};
  const kpiAgents = document.getElementById('kpiAgents');
  if (kpiAgents) kpiAgents.textContent = cachedUsers.length;
  renderMatrixTable();
  renderUsersDirectory();
  updateActiveRiskView();
}

function renderMatrixTable() {
  const table = document.getElementById('matrixTable');
  if (!table) return;
  
  if (cachedRisks.length === 0 || cachedUsers.length === 0) {
    table.innerHTML = `<tr><td style="color:var(--text-dim); padding: 10px;">Waiting for system operators to connect...</td></tr>`;
    return;
  }
  
  // Header Row: Operator Names
  const headerHtml = `
    <thead>
      <tr>
        <th style="position: sticky; left: 0; background: var(--surface); z-index: 2; min-width: 180px; text-align: left; border-bottom: 1px solid var(--border); padding: 8px 10px;">Threat Vector</th>
        ${cachedUsers.map(u => {
          const displayName = u.name ? u.name : u.username;
          return `<th style="text-align: center; min-width: 90px; white-space: nowrap; border-bottom: 1px solid var(--border); padding: 8px 10px;" title="${displayName}">${displayName}</th>`;
        }).join('')}
      </tr>
    </thead>
  `;
  
  // Body Rows: Risks
  const bodyHtml = `
    <tbody>
      ${cachedRisks.map(r => `
        <tr>
          <td style="position: sticky; left: 0; background: var(--surface); z-index: 1; font-weight: 600; white-space: nowrap; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 9px 10px;">
            <span style="font-size: 1.1rem; margin-right: 6px;">${r.icon}</span>${r.title}
          </td>
          ${cachedUsers.map(u => {
            const key = `${u.id}-${r.id}`;
            const clickInfo = cachedMatrix[key];
            const hasClicked = clickInfo && clickInfo.n > 0;
            return `
              <td style="text-align: center; font-size: 1.1rem; border-bottom: 1px solid var(--border); padding: 9px 10px;">
                ${hasClicked ? '💀' : '<span style="color: rgba(255, 255, 255, 0.055);">•</span>'}
              </td>
            `;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;
  
  table.innerHTML = headerHtml + bodyHtml;
}

function renderUsersDirectory(list) {
  const users = list || cachedUsers;
  const tabTbody = document.getElementById('tabUsersTableBody');
  if (tabTbody) {
    tabTbody.innerHTML = users.map(u => {
      const displayName = u.name ? `${u.name} (${u.username})` : u.username;
      return `
        <tr>
          <td style="font-weight: 500;">${displayName}</td>
          <td class="mono" style="font-size:0.7rem; color:var(--text-dim); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${u.password_hash}">${u.password_hash}</td>
          <td><span class="pill mono" style="background:rgba(255,0,51,0.1); border:1px solid rgba(255,0,51,0.3); color:#f5f5f5; font-size:0.65rem;">${u.role}</span></td>
          <td class="mono" style="font-size:0.75rem;color:var(--text-dim);">${new Date(u.created_at + 'Z').toLocaleString()}</td>
          <td style="font-weight: 600; color:var(--accent);">${u.total_clicks}</td>
          <td class="mono" style="font-size:0.75rem;color:var(--text-dim);">${u.last_click ? new Date(u.last_click + 'Z').toLocaleString() : 'No activity yet'}</td>
          <td><button class="btn-danger-outline" data-remove-user="${u.id}" data-remove-name="${displayName}" style="padding:5px 10px; font-size:0.68rem;">Remove</button></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="7" style="color:var(--text-dim);">No users registered yet.</td></tr>`;
  }
}

// Event delegation so remove buttons keep working across re-renders
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-user]');
  if (!btn) return;
  const id = btn.getAttribute('data-remove-user');
  const name = btn.getAttribute('data-remove-name');
  if (!confirm(`Remove operator "${name}"? This deletes their account and all scan history. This cannot be undone.`)) {
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove user');
    await loadUsers();
  } catch (err) {
    alert(`Error: ${err.message}`);
    btn.disabled = false;
  }
});


async function loadRecent() {
  const res = await fetch(`${API}/api/admin/recent`, { headers: authHeaders() });
  const rows = await res.json();
  const tbody = document.getElementById('recentTableBody');
  tbody.innerHTML = rows.map(r => {
    const displayName = r.name ? `${r.name} (${r.username})` : r.username;
    return `
      <tr>
        <td>${displayName}</td>
        <td>${r.icon} ${r.risk_title}</td>
        <td class="mono" style="font-size:0.75rem;color:var(--text-dim);">${new Date(r.clicked_at + 'Z').toLocaleString()}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3" style="color:var(--text-dim);">No clicks recorded yet.</td></tr>`;
}

// Tab Switching Configuration
const tabList = [
  { btn: document.getElementById('navBtnOverview'), content: document.getElementById('tabContentOverview') },
  { btn: document.getElementById('navBtnUsers'), content: document.getElementById('tabContentUsers') },
  { btn: document.getElementById('navBtnRisks'), content: document.getElementById('tabContentRisks') },
  { btn: document.getElementById('navBtnQuiz'), content: document.getElementById('tabContentQuiz') }
];

tabList.forEach(tab => {
  if (tab.btn && tab.content) {
    tab.btn.addEventListener('click', () => {
      tabList.forEach(t => {
        t.btn.classList.remove('active');
        t.content.classList.add('hidden');
      });
      tab.btn.classList.add('active');
      tab.content.classList.remove('hidden');
      if (tab.btn.id === 'navBtnQuiz') loadQuizResults();
    });
  }
});

// User Search Handler
const searchInput = document.getElementById('userSearchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = cachedUsers.filter(u => u.username.toLowerCase().includes(q));
    renderUsersDirectory(filtered);
  });
}

// Poll for fresh data every 3s so the "graph of who clicked" stays live
setInterval(() => {
  if (localStorage.getItem('rw_admin_token') && !dashWrap.classList.contains('hidden')) {
    loadSummary(); loadUsers(); loadRecent();
  }
}, 3000);

// Faster poll for the live quiz vote tally while a question is in progress
setInterval(() => {
  if (localStorage.getItem('rw_admin_token') && !dashWrap.classList.contains('hidden')) {
    loadQuizLive();
  }
}, 2000);

// Clear Logs Handler
const btnClearLogs = document.getElementById('btnClearLogs');
if (btnClearLogs) {
  btnClearLogs.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to purge all system telemetry logs? This action cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch(`${API}/api/admin/clear-logs`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear logs');
      
      // Reload dashboard data immediately
      await boot();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });
}
function showOperatorScenarios(name) {
  const user = cachedUsers.find(u => (u.name || u.username) === name || u.username === name);
  if (!user) return;
  
  const modal = document.getElementById('dossierModal');
  document.getElementById('modalOperatorName').textContent = name;
  const avatar = document.getElementById('modalAvatar');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();

  const body = document.getElementById('modalDossierBody');
  
  const clickedScenarios = cachedRisks.map(r => {
    const key = `${user.id}-${r.id}`;
    const clickInfo = cachedMatrix[key];
    return {
      title: r.title,
      icon: r.icon,
      clicks: clickInfo ? clickInfo.n : 0,
      last: clickInfo ? clickInfo.last : null
    };
  }).filter(item => item.clicks > 0);
  
  if (clickedScenarios.length === 0) {
    body.innerHTML = `<div style="color:var(--text-dim); font-family: 'IBM Plex Mono', monospace; font-size:0.85rem; padding: 10px 0;">NO ACTIVE THREAT DOSSIER ACCESS RECORDED FOR THIS TERMINAL.</div>`;
  } else {
    body.innerHTML = `
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem;">
        <p style="color:var(--accent); margin-bottom: 12px; font-weight:600;">// DETECTED VECTOR INTERACTION LOGS:</p>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); text-align: left;">
              <th style="padding: 6px 0; color:var(--text-dim); font-size:0.75rem; text-transform:uppercase;">Threat Profile</th>
              <th style="padding: 6px 0; color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; text-align: right;">Scans</th>
              <th style="padding: 6px 0; color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; text-align: right; padding-left: 12px;">Last Handshake</th>
            </tr>
          </thead>
          <tbody>
            ${clickedScenarios.map(s => `
              <tr style="border-bottom: 1px dashed var(--border);">
                <td style="padding: 10px 0; font-weight: 600; color: var(--text);">${s.icon} ${s.title}</td>
                <td style="padding: 10px 0; text-align: right; color: var(--accent); font-weight: bold;">${s.clicks}</td>
                <td style="padding: 10px 0; text-align: right; color: var(--text-dim); font-size: 0.75rem; padding-left:12px;">${new Date(s.last + 'Z').toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  modal.classList.remove('hidden');
}

// Modal handlers
const btnCloseModal = document.getElementById('btnCloseModal');
if (btnCloseModal) {
  btnCloseModal.addEventListener('click', () => {
    document.getElementById('dossierModal').classList.add('hidden');
  });
}
window.addEventListener('click', (e) => {
  const modal = document.getElementById('dossierModal');
  if (e.target === modal) {
    modal.classList.add('hidden');
  }
});

function updateActiveRiskView() {
  const select = document.getElementById('eventFocusSelect');
  if (!select) return;
  
  const riskId = parseInt(select.value) || currentActiveRiskId;
  currentActiveRiskId = riskId;
  
  const focusUsersContainer = document.getElementById('eventFocusUsers');
  const tally = document.getElementById('eventFocusTally');
  if (!focusUsersContainer || !tally) return;
  
  // Find all users who clicked this risk
  const activeUsersWhoClicked = cachedUsers.filter(u => {
    const key = `${u.id}-${riskId}`;
    const clickInfo = cachedMatrix[key];
    return clickInfo && clickInfo.n > 0;
  });
  
  // Update tally
  tally.textContent = `${activeUsersWhoClicked.length} of ${cachedUsers.length} scanned`;
  
  // Update badges
  if (activeUsersWhoClicked.length === 0) {
    focusUsersContainer.innerHTML = `<span class="operator-badge-empty">// No operators have reported interactions with this vector yet.</span>`;
  } else {
    focusUsersContainer.innerHTML = activeUsersWhoClicked.map(u => {
      const displayName = u.name ? `${u.name} (${u.username})` : u.username;
      return `
        <div class="operator-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>${displayName}</span>
        </div>
      `;
    }).join('');
  }
}

let listenersSetup = false;
function setupEventFocusListeners() {
  if (listenersSetup) return;
  
  const select = document.getElementById('eventFocusSelect');
  const btnNext = document.getElementById('btnNextFocus');
  const checkbox = document.getElementById('enforceFocusLock');
  
  if (select) {
    select.addEventListener('change', () => {
      currentActiveRiskId = parseInt(select.value) || 1;
      updateActiveRiskView();
      saveEventFocusState();
    });
  }
  
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (select && select.options.length > 0) {
        let nextIndex = select.selectedIndex + 1;
        if (nextIndex >= select.options.length) {
          nextIndex = 0; // Loop back
        }
        select.selectedIndex = nextIndex;
        currentActiveRiskId = parseInt(select.value) || 1;
        updateActiveRiskView();
        saveEventFocusState();
      }
    });
  }
  
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      saveEventFocusState();
    });
  }
  
  listenersSetup = true;
}

async function saveEventFocusState() {
  const select = document.getElementById('eventFocusSelect');
  const checkbox = document.getElementById('enforceFocusLock');
  if (!select) return;
  
  const activeFocusId = parseInt(select.value) || 1;
  const focusLocked = checkbox ? checkbox.checked : true;
  
  try {
    const res = await fetch(`${API}/api/admin/event-focus`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ activeFocusId, focusLocked })
    });
    if (!res.ok) throw new Error('Failed to update event focus');
  } catch (err) {
    console.error('Error saving focus state:', err);
  }
}

async function loadEventFocusState() {
  try {
    const res = await fetch(`${API}/api/admin/event-focus`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    
    currentActiveRiskId = data.activeFocusId || 1;
    const select = document.getElementById('eventFocusSelect');
    if (select) select.value = currentActiveRiskId;
    
    const checkbox = document.getElementById('enforceFocusLock');
    if (checkbox) checkbox.checked = typeof data.focusLocked === 'boolean' ? data.focusLocked : true;
    
    updateActiveRiskView();
  } catch (err) {
    console.error('Error loading focus state:', err);
  }
}

// ---------- Live Quiz Control ----------
let cachedQuizzes = [];
let quizControlListenersSetup = false;
let quizControlTimer = { active: false, questionStartedAt: null, timeLimitMs: null };
let quizControlRenderKey = null;

// Smooth per-frame countdown for the presenter console, decoupled from the 2s poll
setInterval(() => {
  const fill = document.getElementById('quizControlTimerFill');
  const text = document.getElementById('quizControlTimerText');
  if (!quizControlTimer.active || !fill || !text) return;
  const remainingMs = Math.max(0, quizControlTimer.questionStartedAt + quizControlTimer.timeLimitMs - Date.now());
  const pct = Math.max(0, Math.min(100, (remainingMs / quizControlTimer.timeLimitMs) * 100));
  fill.style.width = `${pct}%`;
  text.textContent = `${Math.ceil(remainingMs / 1000)}s`;
  fill.classList.toggle('low', remainingMs <= 5000);
}, 200);

async function loadQuizState() {
  const res = await fetch(`${API}/api/admin/quiz-state`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  cachedQuizzes = data.quizzes || [];

  const quizSelect = document.getElementById('quizSelect');
  if (quizSelect && quizSelect.children.length === 0) {
    quizSelect.innerHTML = cachedQuizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');
  }
  const quizResultsSelect = document.getElementById('quizResultsSelect');
  if (quizResultsSelect && quizResultsSelect.children.length === 0) {
    quizResultsSelect.innerHTML = cachedQuizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');
    quizResultsSelect.addEventListener('change', loadQuizResults);
  }

  const pill = document.getElementById('quizStatusPill');
  const launcher = document.getElementById('quizLauncher');
  const controlPanel = document.getElementById('quizControlPanel');

  if (!data.activeQuizId) {
    if (pill) pill.textContent = 'No quiz active';
    if (launcher) launcher.classList.remove('hidden');
    if (controlPanel) controlPanel.classList.add('hidden');
    return;
  }

  const quizTitle = (cachedQuizzes.find(q => q.id === data.activeQuizId) || {}).title || data.activeQuizId;
  if (pill) pill.textContent = data.phase === 'complete'
    ? `${quizTitle} · Complete`
    : `${quizTitle} · Q${data.activeQuestionN} · ${data.phase === 'revealed' ? 'Revealed' : 'Voting'}`;
  if (launcher) launcher.classList.add('hidden');
  if (controlPanel) controlPanel.classList.remove('hidden');

  await loadQuizLive();
}

async function loadQuizLive() {
  const controlPanel = document.getElementById('quizControlPanel');
  if (!controlPanel || controlPanel.classList.contains('hidden')) return;

  const res = await fetch(`${API}/api/admin/quiz-live`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  if (!data.activeQuizId) return;

  const qText = document.getElementById('quizControlQuestion');
  const tally = document.getElementById('quizControlTally');
  const bars = document.getElementById('quizControlBars');
  const btnReveal = document.getElementById('btnRevealQuiz');
  const btnNext = document.getElementById('btnNextQuiz');
  const timerWrap = document.getElementById('quizControlTimerWrap');

  if (data.phase === 'voting' && data.questionStartedAt) {
    quizControlTimer = { active: true, questionStartedAt: data.questionStartedAt, timeLimitMs: data.timeLimitMs || 20000 };
    if (timerWrap) timerWrap.classList.remove('hidden');
  } else {
    quizControlTimer.active = false;
    if (timerWrap) timerWrap.classList.add('hidden');
  }

  if (data.phase === 'complete') {
    if (btnReveal) btnReveal.classList.add('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    const key = `complete|${data.activeQuizId}`;
    if (key === quizControlRenderKey) return;
    quizControlRenderKey = key;

    if (qText) qText.textContent = 'Quiz complete';
    if (tally) tally.textContent = `See the Quiz Results tab for the full breakdown.`;
    if (bars) bars.innerHTML = (data.leaderboard || []).slice(0, 5).map((l, i) => `
      <div class="quiz-bar-row">
        <div class="quiz-bar-label"><span>#${i + 1} ${l.name}</span><span>${l.score} pts</span></div>
      </div>
    `).join('') || `<div style="color:var(--text-dim); font-size:0.8rem;">No answers recorded.</div>`;
    return;
  }

  if (btnReveal) btnReveal.classList.remove('hidden');
  if (btnNext) btnNext.classList.remove('hidden');

  if (tally) tally.textContent = `${data.answered} of ${data.totalUsers} answered`;

  // Only reveal which option is correct once everyone's had a chance to vote (or the presenter reveals) —
  // otherwise the presenter's own screen spoils the answer the instant a question opens.
  const showCorrect = data.phase === 'revealed' || (data.totalUsers > 0 && data.answered >= data.totalUsers);

  const key = `${data.phase}|${data.activeQuizId}|${data.questionN || data.activeQuestionN}|${showCorrect}`;
  const contentChanged = key !== quizControlRenderKey;
  quizControlRenderKey = key;

  if (contentChanged && qText) qText.textContent = data.question || '';

  const totalVotes = data.optionCounts.reduce((a, b) => a + b, 0) || 1;
  if (bars) {
    if (contentChanged) {
      bars.innerHTML = data.options.map((opt, i) => {
        const isCorrect = showCorrect && i === data.correct;
        return `
          <div class="quiz-bar-row ${isCorrect ? 'correct' : ''}" data-option-index="${i}">
            <div class="quiz-bar-label"><span>${opt} ${isCorrect ? '✅' : ''}</span><span data-count>0 · 0%</span></div>
            <div class="quiz-bar-bg"><div class="quiz-bar-fill" data-fill></div></div>
          </div>
        `;
      }).join('');
      void bars.offsetWidth; // force a reflow so the bars grow from 0 instead of snapping in
    }
    // Always refresh the live counts/widths, even when we skip re-animating the container
    bars.querySelectorAll('.quiz-bar-row').forEach(row => {
      const i = parseInt(row.getAttribute('data-option-index'));
      const count = data.optionCounts[i] || 0;
      const pct = Math.round((count / totalVotes) * 100);
      const countLabel = row.querySelector('[data-count]');
      const fill = row.querySelector('[data-fill]');
      if (countLabel) countLabel.textContent = `${count} · ${pct}%`;
      if (fill) fill.style.width = `${pct}%`;
    });
  }
}

function setupQuizControlListeners() {
  if (quizControlListenersSetup) return;

  const btnLaunch = document.getElementById('btnLaunchQuiz');
  const btnReveal = document.getElementById('btnRevealQuiz');
  const btnNext = document.getElementById('btnNextQuiz');
  const btnEnd = document.getElementById('btnEndQuiz');
  const quizSelect = document.getElementById('quizSelect');

  async function sendQuizAction(action, extra) {
    try {
      const res = await fetch(`${API}/api/admin/quiz-control`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quiz action failed');
      await loadQuizState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  if (btnLaunch) btnLaunch.addEventListener('click', () => {
    if (!quizSelect || !quizSelect.value) return;
    sendQuizAction('launch', { quizId: quizSelect.value });
  });
  if (btnReveal) btnReveal.addEventListener('click', () => sendQuizAction('reveal'));
  if (btnNext) btnNext.addEventListener('click', () => sendQuizAction('next'));
  if (btnEnd) btnEnd.addEventListener('click', () => {
    if (!confirm('End the live quiz for all operators?')) return;
    sendQuizAction('end');
  });

  quizControlListenersSetup = true;
}

async function loadQuizResults() {
  const select = document.getElementById('quizResultsSelect');
  if (!select || !select.value) return;

  const res = await fetch(`${API}/api/admin/quiz-results?quizId=${encodeURIComponent(select.value)}`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();

  const qBody = document.getElementById('quizQuestionsTableBody');
  if (qBody) {
    qBody.innerHTML = data.perQuestion.map(q => `
      <tr>
        <td class="mono">${q.n}</td>
        <td>${q.question}</td>
        <td>${q.answered}</td>
        <td style="font-weight:600; color:var(--accent);">${q.pctCorrect}%</td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="color:var(--text-dim);">No data yet.</td></tr>`;
  }

  const lBody = document.getElementById('quizLeaderboardTableBody');
  if (lBody) {
    lBody.innerHTML = data.perUser.map(u => `
      <tr><td>${u.name}</td><td style="font-weight:600; color:var(--accent);">${u.score}</td><td>${u.correctCount}</td></tr>
    `).join('') || `<tr><td colspan="3" style="color:var(--text-dim);">No answers recorded yet.</td></tr>`;
  }
}

checkViewport();
if (localStorage.getItem('rw_admin_token')) boot();
