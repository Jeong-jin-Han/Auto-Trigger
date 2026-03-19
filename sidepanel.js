// ── State ─────────────────────────────────────────────────────────────────────
let recordState = 'idle'; // 'idle' | 'recording' | 'stopped'
let recordedClicks = [];
let isAutoRunning = false;
let soundEnabled = false;
let soundVolume = 0.7;
let userOverrodeTheme = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const themeBtn       = document.getElementById('themeBtn');
const soundBtn       = document.getElementById('soundBtn');
const devBtn         = document.getElementById('devBtn');
const helpBtn        = document.getElementById('helpBtn');
const helpModal      = document.getElementById('helpModal');
const closeHelp      = document.getElementById('closeHelp');
const volumeSlider   = document.getElementById('volumeSlider');
const volumeVal      = document.getElementById('volumeVal');
const recordBtn      = document.getElementById('recordBtn');
const clearBtn       = document.getElementById('clearBtn');
const clickCount     = document.getElementById('clickCount');
const clickList      = document.getElementById('clickList');
const repeatCount    = document.getElementById('repeatCount');
const delayInput     = document.getElementById('delayInput');
const replayBtn      = document.getElementById('replayBtn');
const noPatternMacro = document.getElementById('noPatternMacro');
const macroResult    = document.getElementById('macroResult');
const autoToggleBtn  = document.getElementById('autoToggleBtn');
const noPatternAuto  = document.getElementById('noPatternAuto');
const autoStatus     = document.getElementById('autoStatus');
const autoResult     = document.getElementById('autoResult');
const devSection     = document.getElementById('devSection');
const eventLog       = document.getElementById('eventLog');
const tooltipEl      = document.getElementById('tooltip');
const devOnlyEls     = () => document.querySelectorAll('.dev-only');

// ── Custom tooltips (icon-only header buttons only) ───────────────────────────
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tooltip]');
  if (!el) return;
  tooltipEl.textContent = el.dataset.tooltip;
  tooltipEl.style.visibility = 'hidden';
  tooltipEl.classList.remove('hidden');
  const rect = el.getBoundingClientRect();
  const tw = tooltipEl.offsetWidth;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - tw / 2, window.innerWidth - tw - 8));
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = (rect.bottom + 6) + 'px';
  tooltipEl.style.visibility = 'visible';
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('[data-tooltip]')) tooltipEl.classList.add('hidden');
});

// ── Theme ─────────────────────────────────────────────────────────────────────
const moonSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const sunSVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function applyTheme(light) {
  document.body.classList.toggle('light', light);
  themeBtn.innerHTML = light ? moonSVG : sunSVG;
  themeBtn.dataset.tooltip = light ? 'Switch to dark mode' : 'Switch to light mode';
}

const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
applyTheme(!systemPrefersDark.matches);

systemPrefersDark.addEventListener('change', (e) => {
  if (!userOverrodeTheme) applyTheme(!e.matches);
});

themeBtn.addEventListener('click', () => {
  userOverrodeTheme = true;
  applyTheme(!document.body.classList.contains('light'));
});

// ── Sound toggle ──────────────────────────────────────────────────────────────
soundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundBtn.classList.toggle('sound-on', soundEnabled);
  soundBtn.classList.toggle('sound-off', !soundEnabled);
});

function playAlert() {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(soundVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// ── Volume popup (show on hover, hide after 5s) ───────────────────────────────
const soundWrapper  = document.querySelector('.sound-wrapper');
const volumePopup   = document.querySelector('.volume-popup');
let volumeHideTimer = null;

function showVolumePopup() {
  clearTimeout(volumeHideTimer);
  volumePopup.classList.add('visible');
}
function scheduleHideVolumePopup() {
  clearTimeout(volumeHideTimer);
  volumeHideTimer = setTimeout(() => volumePopup.classList.remove('visible'), 2500);
}

soundWrapper.addEventListener('mouseenter', showVolumePopup);
soundWrapper.addEventListener('mouseleave', scheduleHideVolumePopup);
volumePopup.addEventListener('mouseenter', showVolumePopup);
volumePopup.addEventListener('mouseleave', scheduleHideVolumePopup);

// ── Volume slider ─────────────────────────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  const v = parseInt(volumeSlider.value, 10);
  soundVolume = v / 100;
  volumeVal.textContent = `${v}%`;
});


// ── Delay input validation ────────────────────────────────────────────────────
delayInput.addEventListener('change', () => {
  const v = parseFloat(delayInput.value);
  if (isNaN(v) || v < 0) delayInput.value = 0;
});

// ── Help modal ────────────────────────────────────────────────────────────────
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.add('hidden');
});

// ── Dev mode toggle ───────────────────────────────────────────────────────────
devBtn.addEventListener('click', () => {
  const isVisible = !devSection.classList.contains('hidden');
  devSection.classList.toggle('hidden', isVisible);
  devOnlyEls().forEach(el => el.classList.toggle('hidden', isVisible));
  devBtn.classList.toggle('dev-on', !isVisible);
  devBtn.classList.toggle('dev-off', isVisible);
  devBtn.dataset.tooltip = isVisible ? 'Show dev log' : 'Hide dev log';
});

// ── Inject content script ─────────────────────────────────────────────────────
function ensureContentScript() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'INJECT_CONTENT_SCRIPT' }, (res) => resolve(res));
  });
}

// ── Result helpers ────────────────────────────────────────────────────────────
function showResult(el, msg, type) {
  el.textContent = msg;
  el.className = `action-result ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Sync action buttons ───────────────────────────────────────────────────────
function updateActionButtons() {
  const blocked = recordState === 'recording';
  const noClicks = recordedClicks.length === 0;
  replayBtn.disabled = noClicks || blocked;
  autoToggleBtn.disabled = !isAutoRunning && (noClicks || blocked);
}

// ── Record button ─────────────────────────────────────────────────────────────
recordBtn.addEventListener('click', async () => {
  await ensureContentScript();

  if (recordState === 'idle') {
    recordState = 'recording';
    recordedClicks = [];
    updateRecordBtn();
    renderClickList();
    updateActionButtons();
    chrome.runtime.sendMessage({ type: 'START_RECORDING' });

  } else if (recordState === 'recording') {
    recordState = 'stopped';
    updateRecordBtn();
    renderClickList();
    updateActionButtons();
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

  } else if (recordState === 'stopped') {
    recordState = 'recording';
    updateRecordBtn();
    renderClickList();
    updateActionButtons();
    chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
  }
});

function updateRecordBtn() {
  recordBtn.className = 'btn';
  if (recordState === 'idle') {
    recordBtn.textContent = '⏺ Record';
    recordBtn.classList.add('btn-record');
  } else if (recordState === 'recording') {
    recordBtn.textContent = '⏹ Stop';
    recordBtn.classList.add('btn-stop');
  } else if (recordState === 'stopped') {
    recordBtn.textContent = '⏵ Resume';
    recordBtn.classList.add('btn-resume');
  }
}

// ── Clear (trash) button ──────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  recordedClicks = [];
  recordState = 'idle';
  updateRecordBtn();
  renderClickList();
  updateActionButtons();
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
});

// ── Render click list ─────────────────────────────────────────────────────────
function renderClickList() {
  const n = recordedClicks.length;
  clickCount.textContent = n === 0 ? 'No clicks recorded' : `${n} click${n > 1 ? 's' : ''} recorded`;
  clearBtn.classList.toggle('hidden', n === 0);

  if (n === 0) {
    clickList.innerHTML = '<div class="empty-msg">No clicks recorded yet.</div>';
    return;
  }
  clickList.innerHTML = recordedClicks.map((c, i) => `
    <div class="click-item">
      <span class="click-num">${i + 1}</span>
      <span class="click-info" title="${c.selector}">${c.selector} (${Math.round(c.x)}, ${Math.round(c.y)})</span>
    </div>
  `).join('');
}

// ── Replay button ─────────────────────────────────────────────────────────────
replayBtn.addEventListener('click', async () => {
  if (recordedClicks.length === 0) {
    noPatternMacro.classList.remove('hidden');
    setTimeout(() => noPatternMacro.classList.add('hidden'), 3000);
    return;
  }
  await ensureContentScript();
  const repeat = parseInt(repeatCount.value, 10) || 1;
  const delayMs = Math.round(parseFloat(delayInput.value) * 1000) || 0;
  chrome.runtime.sendMessage({ type: 'REPLAY_CLICKS', pattern: recordedClicks, repeat, delayMs });
  replayBtn.disabled = true;
  replayBtn.textContent = '⏳ Running…';
  addLog(`Replay started (${repeat}x, ${delayInput.value}s delay)`);
});

// ── Auto trigger toggle ───────────────────────────────────────────────────────
autoToggleBtn.addEventListener('click', async () => {
  if (!isAutoRunning && recordedClicks.length === 0) {
    noPatternAuto.classList.remove('hidden');
    setTimeout(() => noPatternAuto.classList.add('hidden'), 3000);
    return;
  }
  await ensureContentScript();

  if (!isAutoRunning) {
    isAutoRunning = true;
    noPatternAuto.classList.add('hidden');
    autoToggleBtn.textContent = '⏹ Stop Auto Trigger';
    autoToggleBtn.className = 'btn btn-auto-stop';
    autoStatus.textContent = 'Listening for video end…';
    autoStatus.className = 'status-bar active';
    chrome.runtime.sendMessage({ type: 'START_AUTO_DETECTION', pattern: recordedClicks });
    addLog('Auto trigger started');
  } else {
    isAutoRunning = false;
    autoToggleBtn.textContent = '▶ Start Auto Trigger';
    autoToggleBtn.className = 'btn btn-auto-start';
    autoStatus.textContent = 'Idle';
    autoStatus.className = 'status-bar';
    chrome.runtime.sendMessage({ type: 'STOP_AUTO_DETECTION' });
    addLog('Auto trigger stopped');
  }
});

// ── Incoming messages ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLICK_RECORDED') {
    recordedClicks.push(message.click);
    renderClickList();
    updateActionButtons();
    addLog(`Click recorded: ${message.click.selector}`);
  }

  if (message.type === 'VIDEO_ENDED') {
    autoStatus.textContent = 'Video ended — clicking…';
    autoStatus.className = 'status-bar event';
    addLog('Video ended');
    setTimeout(() => {
      if (isAutoRunning) {
        autoStatus.textContent = 'Listening for video end…';
        autoStatus.className = 'status-bar active';
      }
    }, 2500);
  }

  if (message.type === 'CLICK_PERFORMED') {
    const counter = message.total > 1 ? ` (${message.step}/${message.total})` : '';
    addLog(`Click performed${counter} via ${message.method}`);
    if (message.source === 'auto') {
      showResult(autoResult, 'Triggered successfully', 'success');
      playAlert();
    }
  }

  if (message.type === 'CLICK_FAILED') {
    addLog('Click failed — element not found');
    showResult(isAutoRunning ? autoResult : macroResult, 'Click failed — element not found', 'failure');
    if (!isAutoRunning) {
      replayBtn.textContent = '▶ Replay Pattern';
      updateActionButtons();
    }
  }

  if (message.type === 'REPLAY_DONE') {
    addLog(`Replay complete (${message.repeat}x)`);
    showResult(macroResult, `Replay complete — ${message.repeat} time(s)`, 'success');
    playAlert();
    replayBtn.textContent = '▶ Replay Pattern';
    updateActionButtons();
  }
});

// ── Dev log ───────────────────────────────────────────────────────────────────
function addLog(msg) {
  const now = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="time">${now}</span>${msg}`;
  eventLog.prepend(entry);
  while (eventLog.children.length > 50) eventLog.removeChild(eventLog.lastChild);
}

// ── On load ───────────────────────────────────────────────────────────────────
ensureContentScript();
