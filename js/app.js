function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting-text').textContent = g + ' ✦';
}

function skipAuth() {
  localStorage.setItem('sp_skipped', '1');
  document.getElementById('auth-overlay').classList.remove('show');
}

// ── FOCUS MODE ──

function enterFocusMode() {
  inFocusMode = true;
  document.getElementById('home-view').classList.remove('active');
  document.getElementById('focus-view').classList.add('active');
}

function exitFocusMode() {
  inFocusMode = false;
  document.getElementById('focus-view').classList.remove('active');
  document.getElementById('home-view').classList.add('active');
  closeCapturePopup();
}

function openCapturePopup() {
  document.getElementById('capture-popup').classList.add('open');
  setTimeout(() => document.getElementById('capture-input').focus(), 50);
}

function closeCapturePopup() {
  document.getElementById('capture-popup').classList.remove('open');
  document.getElementById('capture-input').value = '';
}

function captureThought() {
  const val = document.getElementById('capture-input').value.trim();
  if (!val) return;
  tasks.push({ id: Date.now(), text: val, done: false });
  saveTasks(tasks);
  renderTasks();
  closeCapturePopup();
  const btn = document.querySelector('.focus-add-btn');
  btn.style.background = '#1D9E75';
  setTimeout(() => btn.style.background = '', 700);
}

// ── INIT ──

(async function init() {
  setGreeting();
  setInterval(setGreeting, 60000);
  updateRings();
  updatePhaseLabel();
  updateSessionDots();
  renderTasks();

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    document.getElementById('auth-overlay').classList.remove('show');
    await exchangeCode(code);
    return;
  }

  const token = localStorage.getItem('sp_access_token');
  const skipped = localStorage.getItem('sp_skipped');

  if (token) {
    initSpotify();
  } else if (!skipped) {
    document.getElementById('auth-overlay').classList.add('show');
  } else {
    setSpotifyDisconnected();
  }
})();
