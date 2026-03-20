// Toggle side panel open/close when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Chrome Debugger API ───────────────────────────────────────────────────

let debugTabId = null;

async function ensureDebuggerAttached(tabId) {
  if (debugTabId === tabId) return;
  if (debugTabId !== null) {
    await chrome.debugger.detach({ tabId: debugTabId }).catch(() => {});
    debugTabId = null;
  }
  await chrome.debugger.attach({ tabId }, '1.3');
  debugTabId = tabId;
}

async function debuggerClick(tabId, x, y, hoverX, hoverY) {
  await ensureDebuggerAttached(tabId);
  // Hover at a safe area (player center) to make controls visible,
  // but do NOT move to the target — avoids hover-triggered popups (e.g. volume slider).
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: hoverX, y: hoverY, button: 'none', clickCount: 0
  });
  await new Promise((r) => setTimeout(r, 400));
  // Click directly at target coordinates without moving there first
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', clickCount: 1
  });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1
  });
}

// Detach debugger when tab navigates (prevents stale attachment)
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === debugTabId) debugTabId = null;
});


// ─── Storage helper ────────────────────────────────────────────────────────

// Read autoTriggerState, apply updater, write back. No-op if data is missing.
function updateStorage(updater) {
  chrome.storage.local.get('autoTriggerState', (result) => {
    const data = result.autoTriggerState;
    if (!data) return;
    if (updater(data)) chrome.storage.local.set({ autoTriggerState: data });
  });
}

// Clean up all tab-specific data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  updateStorage((data) => {
    let changed = false;
    if (data.tabRecordings?.[tabId])         { delete data.tabRecordings[tabId]; changed = true; }
    if (data.tabSettings?.[tabId])           { delete data.tabSettings[tabId];   changed = true; }
    const rIdx = data.replayingTabs?.indexOf(tabId) ?? -1;
    if (rIdx !== -1)                         { data.replayingTabs.splice(rIdx, 1); changed = true; }
    const aIdx = data.autoTabs?.indexOf(tabId) ?? -1;
    if (aIdx !== -1)                         { data.autoTabs.splice(aIdx, 1);     changed = true; }
    return changed;
  });
});

// ─── Message Listener ─────────────────────────────────────────────────────

// Forward a message payload to the active tab's content script
function forwardToActiveTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, payload);
  });
}

// ─── Offscreen document ────────────────────────────────────────────────────

// Plays beep.wav via an offscreen document (has DOM; immune to autoplay restrictions).
// Uses BroadcastChannel instead of chrome.runtime.sendMessage to avoid
// known message-routing gaps between service workers and offscreen documents.

let _offscreenCreating = null;

async function playAlertViaOffscreen(volume) {
  console.log('[AutoTrigger] playAlertViaOffscreen, volume:', volume);
  if (_offscreenCreating) {
    await _offscreenCreating;
  } else {
    _offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play beep alert when a watched video ends'
    }).catch((e) => {
      // "Only a single offscreen document" = already exists — that's fine
      if (!e.message?.includes('single')) console.error('[AutoTrigger] offscreen create failed:', e);
    }).finally(() => { _offscreenCreating = null; });
    await _offscreenCreating;
  }
  // BroadcastChannel works reliably between service worker and offscreen document
  const bc = new BroadcastChannel('auto_trigger_audio');
  bc.postMessage({ volume });
  bc.close();
  console.log('[AutoTrigger] BroadcastChannel message sent');
}

// ─── Message Listener ─────────────────────────────────────────────────────

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // VIDEO_ENDED is sent directly from content script to all extension pages — no forwarding needed.

  if (message.type === 'RELOAD_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
    });
  }

  if (message.type === 'INJECT_CONTENT_SCRIPT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }).then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
      }
    });
    return true;
  }

  if (message.type === 'START_RECORDING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'START_RECORDING', tabId: message.tabId || tabs[0].id });
    });
  }

  if (message.type === 'STOP_RECORDING')       forwardToActiveTab({ type: 'STOP_RECORDING' });
  if (message.type === 'STOP_AUTO_DETECTION')  forwardToActiveTab({ type: 'STOP_AUTO_DETECTION' });

  if (message.type === 'RESUME_RECORDING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_RECORDING', tabId: message.tabId || tabs[0].id });
    });
  }

  if (message.type === 'START_AUTO_DETECTION') {
    forwardToActiveTab({ type: 'START_AUTO_DETECTION', selector: message.selector, pattern: message.pattern, tabId: message.tabId, soundEnabled: message.soundEnabled, soundVolume: message.soundVolume });
  }

  if (message.type === 'REPLAY_CLICKS') {
    forwardToActiveTab({ type: 'REPLAY_CLICKS', pattern: message.pattern, repeat: message.repeat, delayMs: message.delayMs, tabId: message.tabId, soundEnabled: message.soundEnabled, soundVolume: message.soundVolume });
  }

  if (message.type === 'DEBUGGER_CLICK') {
    if (message.tabId) {
      debuggerClick(message.tabId, message.x, message.y, message.hoverX ?? message.x, message.hoverY ?? message.y)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, fallback: true }));
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { sendResponse({ success: false, fallback: true }); return; }
        debuggerClick(tabs[0].id, message.x, message.y, message.hoverX ?? message.x, message.hoverY ?? message.y)
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false, fallback: true }));
      });
    }
    return true; // keep channel open for async sendResponse
  }

  if (message.type === 'DEBUGGER_DETACH') {
    if (debugTabId !== null) {
      chrome.debugger.detach({ tabId: debugTabId }).catch(() => {});
      debugTabId = null;
    }
  }

  // When replay finishes, remove the tab from replayingTabs in storage so
  // the panel doesn't see a stale "running" state when it reopens.
  if (message.type === 'REPLAY_DONE' && message.tabId) {
    updateStorage((data) => {
      const idx = data.replayingTabs?.indexOf(message.tabId) ?? -1;
      if (idx === -1) return false;
      data.replayingTabs.splice(idx, 1);
      return true;
    });
  }

  // Play alert via offscreen document (has DOM, immune to page CSP and autoplay restrictions)
  if (message.type === 'PLAY_ALERT') {
    console.log('[AutoTrigger] PLAY_ALERT received from content script');
    playAlertViaOffscreen(message.volume ?? 0.7).catch((e) => console.error('[AutoTrigger] playAlert error:', e));
  }

  // CLICK_RECORDED, CLICK_PERFORMED, CLICK_FAILED are sent directly from the
  // content script to all extension pages — no forwarding needed here.

  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] || null });
    });
    return true;
  }
});
