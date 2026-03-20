// ── State ─────────────────────────────────────────────────────────────────────
let recordState = 'idle'; // 'idle' | 'recording' | 'stopped'
let recordedClicks = [];
let activeTabId   = null; // tab where replay/auto is running
let viewedTabId   = null; // tab currently shown in the panel
const tabRecordings = new Map(); // tabId -> { clicks, recordState, soundEnabled, soundVolume, devVisible }
const tabSettings   = new Map(); // tabId -> { repeat, delay }
const replayingTabs = new Set(); // tabs currently running macro
const autoTabs      = new Set(); // tabs currently running auto trigger
let soundEnabled = false;
let soundVolume = 0.7;
let userOverrodeTheme = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const themeBtn       = document.getElementById('themeBtn');
const soundBtn       = document.getElementById('soundBtn');
const devBtn         = document.getElementById('devBtn');
const reloadBtn      = document.getElementById('reloadBtn');
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
const devOnlyEls     = [...document.querySelectorAll('.dev-only')]; // cached static list
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');

// ── Status display ────────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

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
  saveTabRecording(viewedTabId);
  persistState();
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

document.addEventListener('click', (e) => {
  if (!soundWrapper.contains(e.target)) {
    clearTimeout(volumeHideTimer);
    volumePopup.classList.remove('visible');
  }
});

// ── Volume slider (display updates live; persist is debounced) ────────────────
let _persistTimer = null;
function persistStateLazy() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(persistState, 500);
}

volumeSlider.addEventListener('input', () => {
  const v = parseInt(volumeSlider.value, 10);
  soundVolume = v / 100;
  volumeVal.textContent = `${v}%`;
  saveTabRecording(viewedTabId);
  persistStateLazy();
});

// ── Delay / repeat inputs ─────────────────────────────────────────────────────
delayInput.addEventListener('change', () => {
  const v = parseFloat(delayInput.value);
  if (isNaN(v) || v < 0) delayInput.value = 0;
  saveTabSettings();
  persistState();
});

repeatCount.addEventListener('change', () => { saveTabSettings(); persistState(); });

function saveTabSettings(tabId) {
  const id = tabId || viewedTabId;
  if (!id) return;
  tabSettings.set(id, { repeat: repeatCount.value, delay: delayInput.value });
}

function restoreTabSettings(tabId) {
  const s = tabSettings.get(tabId);
  repeatCount.value = s ? s.repeat : '1';
  delayInput.value  = s ? s.delay  : '2';
}

// ── Reload button (refresh current page + reset state) ───────────────────────
reloadBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RELOAD_TAB' });
  resetState();
  addLog('Page refreshed — state reset');
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
  setDevVisible(!isVisible);
  saveTabRecording(viewedTabId);
  persistState();
});

function setDevVisible(visible) {
  devSection.classList.toggle('hidden', !visible);
  devOnlyEls.forEach(el => el.classList.toggle('hidden', !visible));
  devBtn.classList.toggle('dev-on',  visible);
  devBtn.classList.toggle('dev-off', !visible);
  devBtn.dataset.tooltip = visible ? 'Hide dev log' : 'Show dev log';
  document.body.classList.toggle('dev-active', visible);
}

// ── Inject content script ─────────────────────────────────────────────────────
function ensureContentScript() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'INJECT_CONTENT_SCRIPT' }, (res) => resolve(res));
  });
}

// ── UI helpers — auto trigger button ─────────────────────────────────────────
function setAutoTriggerUI(isRunning) {
  autoToggleBtn.textContent = isRunning ? '⏹ Stop Auto Trigger' : '▶ Start Auto Trigger';
  autoToggleBtn.className   = isRunning ? 'btn btn-auto-stop'   : 'btn btn-auto-start';
  autoStatus.textContent    = isRunning ? 'Listening for video end…' : 'Idle';
  autoStatus.className      = isRunning ? 'status-bar active'  : 'status-bar';
}

// ── UI helpers — replay button ────────────────────────────────────────────────
function setReplayUI(isRunning) {
  replayBtn.textContent = isRunning ? '⏳ Running…' : '▶ Replay Pattern';
  replayBtn.disabled    = isRunning || recordedClicks.length === 0 || recordState === 'recording';
}

// ── Per-tab recording save/restore ────────────────────────────────────────────
function saveTabRecording(tabId) {
  if (!tabId) return;
  const devVisible = !devSection.classList.contains('hidden');
  tabRecordings.set(tabId, { clicks: [...recordedClicks], recordState, soundEnabled, soundVolume, devVisible });
}

function restoreTabRecording(tabId) {
  const saved = tabRecordings.get(tabId);
  recordedClicks = saved ? [...saved.clicks] : [];
  recordState    = saved ? saved.recordState : 'idle';
  // Normalize: can't be recording when restoring; force to stopped if clicks exist
  if (recordState === 'recording' || (recordState === 'idle' && recordedClicks.length > 0)) {
    recordState = recordedClicks.length > 0 ? 'stopped' : 'idle';
  }

  setReplayUI(replayingTabs.has(tabId));
  setAutoTriggerUI(autoTabs.has(tabId));

  // Restore sound state
  soundEnabled = saved?.soundEnabled ?? false;
  soundVolume  = saved?.soundVolume  ?? 0.7;
  soundBtn.classList.toggle('sound-on',  soundEnabled);
  soundBtn.classList.toggle('sound-off', !soundEnabled);
  volumeSlider.value    = Math.round(soundVolume * 100);
  volumeVal.textContent = `${Math.round(soundVolume * 100)}%`;

  // Restore dev mode
  setDevVisible(saved?.devVisible ?? false);

  updateRecordBtn();
  renderClickList();
  updateActionButtons();

  const tabReplaying = replayingTabs.has(tabId);
  const autoRunning  = autoTabs.has(tabId);
  if (tabReplaying)              setStatus('running',  'Repeating…');
  else if (autoRunning)          setStatus('watching', 'Watching for video end...');
  else if (recordedClicks.length) setStatus('ready',   'Pattern ready');
  else                            setStatus('idle',    'Record a pattern');
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
  const blocked      = recordState === 'recording';
  const noClicks     = recordedClicks.length === 0;
  const tabReplaying = replayingTabs.has(viewedTabId);
  const autoRunning  = autoTabs.has(viewedTabId);    // single source of truth
  replayBtn.disabled     = noClicks || blocked || tabReplaying;
  autoToggleBtn.disabled = !autoRunning && (noClicks || blocked);
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
    setStatus('recording', 'Recording...');
    chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: viewedTabId });

  } else if (recordState === 'recording') {
    recordState = 'stopped';
    updateRecordBtn();
    renderClickList();
    updateActionButtons();
    setStatus('ready', 'Pattern ready');
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    saveTabRecording(viewedTabId);
    persistState();

  } else if (recordState === 'stopped') {
    recordState = 'recording';
    updateRecordBtn();
    renderClickList();
    updateActionButtons();
    setStatus('recording', 'Recording...');
    chrome.runtime.sendMessage({ type: 'RESUME_RECORDING', tabId: viewedTabId });
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

// ── Reset state ───────────────────────────────────────────────────────────────
function resetState() {
  recordedClicks = [];
  recordState = 'idle';
  activeTabId = null;
  replayingTabs.delete(viewedTabId);
  autoTabs.delete(viewedTabId);
  tabRecordings.delete(viewedTabId);
  tabSettings.delete(viewedTabId);
  persistState();
  updateRecordBtn();
  renderClickList();
  updateActionButtons();
  setStatus('idle', 'Record a pattern');
  setAutoTriggerUI(false);
  setReplayUI(false);
}

// ── Clear (trash) button ──────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  chrome.runtime.sendMessage({ type: 'RELOAD_TAB' });
  resetState();
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
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (res) => {
    const tabId = res?.tab?.id;
    if (!tabId) return;
    activeTabId = tabId;
    replayingTabs.add(tabId);
    persistState();
    chrome.runtime.sendMessage({ type: 'REPLAY_CLICKS', pattern: recordedClicks, repeat, delayMs, tabId, soundEnabled, soundVolume });
  });
  setReplayUI(true);
  setStatus('running', `Repeating ${repeat}x...`);
  addLog(`Replay started (${repeat}x, ${delayInput.value}s delay)`);
});

// ── Auto trigger toggle ───────────────────────────────────────────────────────
autoToggleBtn.addEventListener('click', async () => {
  const autoRunning = autoTabs.has(viewedTabId);
  if (!autoRunning && recordedClicks.length === 0) {
    noPatternAuto.classList.remove('hidden');
    setTimeout(() => noPatternAuto.classList.add('hidden'), 3000);
    return;
  }
  await ensureContentScript();

  if (!autoRunning) {
    noPatternAuto.classList.add('hidden');
    setAutoTriggerUI(true);
    setStatus('watching', 'Watching for video end...');
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (res) => {
      const tabId = res?.tab?.id;
      if (!tabId) return;
      activeTabId = tabId;
      autoTabs.add(tabId);
      persistState();
      chrome.runtime.sendMessage({ type: 'START_AUTO_DETECTION', pattern: recordedClicks, tabId, soundEnabled, soundVolume });
    });
    addLog('Auto trigger started');
  } else {
    autoTabs.delete(viewedTabId);
    persistState();
    setAutoTriggerUI(false);
    setStatus('ready', 'Pattern ready');
    chrome.runtime.sendMessage({ type: 'STOP_AUTO_DETECTION', tabId: viewedTabId });
    addLog('Auto trigger stopped');
  }
});

// ── Incoming messages ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLICK_RECORDED') {
    // Only accept recorded clicks from the tab currently being viewed
    if (message.tabId && message.tabId !== viewedTabId) return;
    recordedClicks.push(message.click);
    renderClickList();
    updateActionButtons();
    addLog(`Click recorded: ${message.click.selector}`);
    saveTabRecording(viewedTabId);
    persistStateLazy(); // debounced — recording fires frequently
  }

  // For task messages, only handle if they come from the viewed/active tab
  const fromActiveTab = !message.tabId || message.tabId === viewedTabId || message.tabId === activeTabId;

  if (message.type === 'VIDEO_ENDED' && fromActiveTab) {
    autoStatus.textContent = 'Video ended — clicking…';
    autoStatus.className = 'status-bar event';
    addLog('Video ended');
    playAlert();
    setTimeout(() => {
      if (autoTabs.has(viewedTabId)) {
        autoStatus.textContent = 'Listening for video end…';
        autoStatus.className = 'status-bar active';
      }
    }, 2500);
  }

  if (message.type === 'CLICK_PERFORMED' && fromActiveTab) {
    const counter = message.total > 1 ? ` (${message.step}/${message.total})` : '';
    addLog(`Click performed${counter} via ${message.method}`);
    if (message.source === 'auto' && message.step === message.total) {
      showResult(autoResult, 'Triggered successfully', 'success');
      setStatus('watching', 'Watching for video end...');
    }
  }

  if (message.type === 'CLICK_FAILED' && fromActiveTab) {
    addLog('Click failed — element not found');
    const autoRunning = autoTabs.has(viewedTabId);
    showResult(autoRunning ? autoResult : macroResult, 'Click failed — element not found', 'failure');
    if (!autoRunning) {
      setReplayUI(false);
      updateActionButtons();
    }
  }

  if (message.type === 'REPLAY_DONE' && fromActiveTab) {
    replayingTabs.delete(message.tabId);
    persistState();
    addLog(`Replay complete (${message.repeat}x)`);
    showResult(macroResult, `Replay complete — ${message.repeat} time(s)`, 'success');
    playAlert();
    setReplayUI(false);
    setStatus('ready', 'Pattern ready');
    updateActionButtons();
  }
});

// ── Dev log ───────────────────────────────────────────────────────────────────
function addLog(msg) {
  const now = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="time">${now}</span> ${msg}`;
  eventLog.prepend(entry);
  while (eventLog.children.length > 50) eventLog.removeChild(eventLog.lastChild);
}

// ── Poll active tab — tab switch, page reload, URL change detection ───────────
let watchedUrl = null;
let tabWasLoading = false;
let pollReady = false;
setTimeout(() => { pollReady = true; }, 3000); // grace period on panel open
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (res) => {
    const tab = res?.tab;
    if (!tab) return;

    // ── Tab switched ──
    if (tab.id !== viewedTabId) {
      if (viewedTabId !== null) {
        if (recordState === 'recording') {
          chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
        }
        saveTabRecording(viewedTabId);
        saveTabSettings(viewedTabId);
        persistState();
      }
      viewedTabId = tab.id;
      restoreTabRecording(tab.id);
      restoreTabSettings(tab.id);
      watchedUrl = null;
      tabWasLoading = false;
      ensureContentScript();
      addLog(`Switched to tab ${tab.id}`);
      return;
    }

    // ── Page reload detection (only when there is a pattern or recording) ──
    if (!pollReady) return;
    if (recordState !== 'idle') {
      if (tab.status === 'loading') { tabWasLoading = true; return; }
      if (tabWasLoading && tab.status === 'complete') {
        tabWasLoading = false;
        if (!autoTabs.has(viewedTabId)) {
          addLog('Page reloaded — state reset');
          tabRecordings.delete(viewedTabId);
          resetState();
          watchedUrl = null;
          return;
        }
      }
    }

    // ── URL change during recording ──
    if (recordState !== 'recording') return;
    const url = tab.url;
    if (!url) return;
    if (watchedUrl === null) { watchedUrl = url; return; }
    if (url !== watchedUrl) {
      addLog(`URL changed: ${url}`);
      watchedUrl = null;
      reloadBtn.click();
    }
  });
}, 1000);

// ── Persist / load state ──────────────────────────────────────────────────────
function persistState() {
  clearTimeout(_persistTimer); // cancel any pending lazy persist
  chrome.storage.local.set({
    autoTriggerState: {
      tabRecordings:   Object.fromEntries(tabRecordings),
      tabSettings:     Object.fromEntries(tabSettings),
      replayingTabs:   [...replayingTabs],
      autoTabs:        [...autoTabs],
      userOverrodeTheme,
      isLightTheme:    document.body.classList.contains('light'),
    }
  });
}

function loadPersistedState(callback) {
  chrome.storage.local.get('autoTriggerState', (result) => {
    const data = result.autoTriggerState;
    if (data?.tabRecordings) {
      for (const [k, v] of Object.entries(data.tabRecordings)) {
        tabRecordings.set(Number(k), v);
      }
    }
    if (data?.tabSettings) {
      for (const [k, v] of Object.entries(data.tabSettings)) {
        tabSettings.set(Number(k), v);
      }
    }
    if (data?.replayingTabs) data.replayingTabs.forEach(id => replayingTabs.add(Number(id)));
    if (data?.autoTabs)      data.autoTabs.forEach(id => autoTabs.add(Number(id)));
    if (data?.userOverrodeTheme) {
      userOverrodeTheme = true;
      applyTheme(!!data.isLightTheme);
    }
    callback();
  });
}

// ── On load ───────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (res) => {
  const tabId = res?.tab?.id;
  loadPersistedState(() => {
    if (tabId) {
      viewedTabId = tabId;
      restoreTabRecording(tabId);
      restoreTabSettings(tabId);
    }
    // Inject content script then verify actual running state to clear stale entries
    ensureContentScript().then(() => {
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { type: 'GET_RUNNING_STATE' }, (state) => {
        if (chrome.runtime.lastError || !state) return;
        let changed = false;
        if (!state.isReplaying && replayingTabs.has(tabId)) {
          replayingTabs.delete(tabId);
          setReplayUI(false);
          changed = true;
        }
        if (!state.isAutoDetecting && autoTabs.has(tabId)) {
          autoTabs.delete(tabId);
          setAutoTriggerUI(false);
          changed = true;
        }
        if (changed) {
          updateActionButtons();
          setStatus(recordedClicks.length ? 'ready' : 'idle',
                    recordedClicks.length ? 'Pattern ready' : 'Record a pattern');
          persistState();
        }
      });
    });
  });
});
