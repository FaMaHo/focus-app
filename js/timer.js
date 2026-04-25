let FOCUS_MINS = 25, SHORT_MINS = 5, LONG_MINS = 15;
let totalSecs = 1500, remaining = 1500;
let isRunning = false, interval = null;
let phase = 'focus', sessions = 0, inFocusMode = false;

const CIRC_HOME = 2 * Math.PI * 68;
const CIRC_FOCUS = 2 * Math.PI * 104;

function fmtTime(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function updateRings() {
  const pct = remaining / totalSecs;
  document.getElementById('ring-progress').style.strokeDashoffset = CIRC_HOME * (1 - pct);
  document.getElementById('focus-ring-progress').style.strokeDashoffset = CIRC_FOCUS * (1 - pct);
  document.getElementById('timer-display').textContent = fmtTime(remaining);
  document.getElementById('focus-display').textContent = fmtTime(remaining);
}

function updatePhaseLabel() {
  const labels = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  document.getElementById('timer-phase').textContent = labels[phase];
  document.getElementById('focus-phase-label').textContent =
    phase === 'focus' ? 'Focus session' : phase === 'short' ? 'Short break' : 'Long break';
}

function updateSessionDots() {
  for (let i = 0; i < 4; i++) {
    const cls = i < sessions % 5 ? 'dot done' : 'dot';
    ['d', 'fd'].forEach(p => {
      const el = document.getElementById(p + i);
      if (el) el.className = cls;
    });
  }
}

function tick() {
  if (remaining <= 0) { clearInterval(interval); isRunning = false; onPhaseEnd(); return; }
  remaining--;
  updateRings();
}

function onPhaseEnd() {
  if (phase === 'focus') {
    sessions++;
    updateSessionDots();
    phase = sessions % 4 === 0 ? 'long' : 'short';
    totalSecs = (phase === 'long' ? LONG_MINS : SHORT_MINS) * 60;
  } else {
    phase = 'focus';
    totalSecs = FOCUS_MINS * 60;
  }
  remaining = totalSecs;
  updateRings();
  updatePhaseLabel();
  setStartBtns('Start');
}

function toggleTimer() {
  if (isRunning) {
    clearInterval(interval);
    isRunning = false;
    setStartBtns('Resume');
  } else {
    isRunning = true;
    interval = setInterval(tick, 1000);
    setStartBtns('Pause');
    document.getElementById('focus-mode-btn').classList.add('show');
  }
}

function setStartBtns(t) {
  document.getElementById('start-btn').textContent = t;
  document.getElementById('focus-start-btn').textContent = t;
}

function resetTimer() {
  clearInterval(interval);
  isRunning = false;
  phase = 'focus';
  totalSecs = FOCUS_MINS * 60;
  remaining = totalSecs;
  updateRings();
  updatePhaseLabel();
  setStartBtns('Start');
  document.getElementById('focus-mode-btn').classList.remove('show');
}

function toggleSettings() {
  document.getElementById('pomo-settings').classList.toggle('open');
}

function applySettings() {
  FOCUS_MINS = Math.max(1, Math.min(120, parseInt(document.getElementById('set-focus').value) || 25));
  SHORT_MINS = Math.max(1, Math.min(30,  parseInt(document.getElementById('set-short').value) || 5));
  LONG_MINS  = Math.max(1, Math.min(60,  parseInt(document.getElementById('set-long').value)  || 15));
  resetTimer();
  document.getElementById('pomo-settings').classList.remove('open');
}
