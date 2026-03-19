// ── State ─────────────────────────────────────────────────────────────────────
let recordState = 'idle'; // 'idle' | 'recording' | 'stopped'
let recordedClicks = [];
let isAutoRunning = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const refreshBtn     = document.getElementById('refreshBtn');
const recordBtn      = document.getElementById('recordBtn');
const clearBtn       = document.getElementById('clearBtn');
const clickList      = document.getElementById('clickList');
const repeatCount    = document.getElementById('repeatCount');
const replayBtn      = document.getElementById('replayBtn');
const autoToggleBtn  = document.getElementById('autoToggleBtn');
const nextSelector   = document.getElementById('nextSelector');
const autoStatus     = document.getElementById('autoStatus');
const eventLog       = document.getElementById('eventLog');
const tabs           = document.querySelectorAll('.tab');
const panels         = document.querySelectorAll('.panel');

// ── Tab switching ─────────────────────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Panel').classList.add('active');
  });
});

// ── Inject content script helper ──────────────────────────────────────────────
function ensureContentScript() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'INJECT_CONTENT_SCRIPT' }, (res) => {
      resolve(res);
    });
  });
}

// ── Refresh button ────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', async () => {
  refreshBtn.textContent = '↻';
  refreshBtn.style.animation = 'spin 0.5s linear';
  await ensureContentScript();
  setTimeout(() => {
    refreshBtn.textContent = '↺';
    refreshBtn.style.animation = '';
  }, 600);
  addLog('Content script re-injected');
});

// ── Record button ─────────────────────────────────────────────────────────────
recordBtn.addEventListener('click', async () => {
  await ensureContentScript();

  if (recordState === 'idle') {
    // Start recording
    recordState = 'recording';
    recordedClicks = [];
    renderClickList();
    updateRecordBtn();
    chrome.runtime.sendMessage({ type: 'START_RECORDING' });

  } else if (recordState === 'recording') {
    // Stop recording
    recordState = 'stopped';
    updateRecordBtn();
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

  } else if (recordState === 'stopped') {
    // Resume recording
    recordState = 'recording';
    updateRecordBtn();
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

// ── Clear button ──────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  recordedClicks = [];
  recordState = 'idle';
  updateRecordBtn();
  renderClickList();
  replayBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
});

// ── Render click list ─────────────────────────────────────────────────────────
function renderClickList() {
  if (recordedClicks.length === 0) {
    clickList.innerHTML = '<div class="empty-msg">No clicks recorded yet.</div>';
    replayBtn.disabled = true;
    return;
  }

  clickList.innerHTML = recordedClicks.map((c, i) => `
    <div class="click-item">
      <span class="click-num">${i + 1}</span>
      <span class="click-info" title="${c.selector}">${c.selector} (${Math.round(c.x)}, ${Math.round(c.y)})</span>
    </div>
  `).join('');

  replayBtn.disabled = recordedClicks.length === 0;
}

// ── Replay button ─────────────────────────────────────────────────────────────
replayBtn.addEventListener('click', async () => {
  if (recordedClicks.length === 0) return;
  await ensureContentScript();
  const repeat = parseInt(repeatCount.value, 10) || 1;
  chrome.runtime.sendMessage({
    type: 'REPLAY_CLICKS',
    pattern: recordedClicks,
    repeat
  });
});

// ── Auto detect toggle ────────────────────────────────────────────────────────
autoToggleBtn.addEventListener('click', async () => {
  await ensureContentScript();

  if (!isAutoRunning) {
    isAutoRunning = true;
    autoToggleBtn.textContent = '⏹ Stop Auto Detect';
    autoToggleBtn.className = 'btn btn-auto-stop';
    autoStatus.textContent = 'Listening for video end…';
    autoStatus.className = 'status-bar active';
    chrome.runtime.sendMessage({
      type: 'START_AUTO_DETECTION',
      selector: nextSelector.value.trim(),
      pattern: recordedClicks
    });
    addLog('Auto detection started');
  } else {
    isAutoRunning = false;
    autoToggleBtn.textContent = '▶ Start Auto Detect';
    autoToggleBtn.className = 'btn btn-auto-start';
    autoStatus.textContent = 'Idle';
    autoStatus.className = 'status-bar';
    chrome.runtime.sendMessage({ type: 'STOP_AUTO_DETECTION' });
    addLog('Auto detection stopped');
  }
});

// ── Incoming messages from background / content ───────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLICK_RECORDED') {
    recordedClicks.push(message.click);
    renderClickList();
  }

  if (message.type === 'VIDEO_ENDED') {
    addLog('Video ended — attempting click…');
    autoStatus.textContent = 'Video ended! Clicking next…';
    autoStatus.className = 'status-bar event';
    setTimeout(() => {
      if (isAutoRunning) {
        autoStatus.textContent = 'Listening for video end…';
        autoStatus.className = 'status-bar active';
      }
    }, 2500);
  }

  if (message.type === 'CLICK_PERFORMED') {
    addLog(`✓ Clicked via ${message.method}`);
  }

  if (message.type === 'CLICK_FAILED') {
    addLog(`✗ Click failed — selector not found`);
  }
});

// ── Event log helper ──────────────────────────────────────────────────────────
function addLog(msg) {
  const now = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="time">${now}</span>${msg}`;
  eventLog.prepend(entry);

  // Keep max 30 entries
  while (eventLog.children.length > 30) {
    eventLog.removeChild(eventLog.lastChild);
  }
}

// ── On load: inject content script ───────────────────────────────────────────
ensureContentScript();
