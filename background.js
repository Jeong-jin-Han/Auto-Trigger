// Toggle side panel open/close when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Chrome Debugger API ───────────────────────────────────────────────────

const debugAttachedTabs = new Set();

// ─── Auto detection — single tab only ─────────────────────────────────────
let currentAutoTabId = null;

async function ensureDebuggerAttached(tabId) {
  if (debugAttachedTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, '1.3');
  debugAttachedTabs.add(tabId);
}

async function debuggerClick(tabId, x, y, hoverX, hoverY) {
  await ensureDebuggerAttached(tabId);
  // Hover at a safe area (player center) to make controls visible,
  // but do NOT move to the target — avoids hover-triggered popups (e.g. volume slider).
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: hoverX, y: hoverY, button: 'none', clickCount: 0
  });
  await new Promise((r) => setTimeout(r, 150));
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
  debugAttachedTabs.delete(source.tabId);
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
  if (currentAutoTabId === tabId) currentAutoTabId = null;
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

// ─── Alert sound ───────────────────────────────────────────────────────────

// Write volume to storage, then create a fresh offscreen document.
// offscreen.js reads the volume from storage the moment its script executes —
// storage.local.set is always awaited before createDocument is called, so
// the value is guaranteed to be present when the document loads.
async function playAlertViaOffscreen(volume) {
  const vol = Math.min(1, Math.max(0, volume));
  await chrome.storage.local.set({ _alertVolume: vol });
  await chrome.offscreen.closeDocument().catch(() => {});
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play alert beep when auto-trigger or replay completes'
  });
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

  if (message.type === 'STOP_RECORDING')      forwardToActiveTab({ type: 'STOP_RECORDING' });
  if (message.type === 'STOP_AUTO_DETECTION') {
    const tabId = message.tabId || currentAutoTabId;
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'STOP_AUTO_DETECTION' }).catch(() => {});
    if (currentAutoTabId === tabId) currentAutoTabId = null;
  }

  if (message.type === 'RESUME_RECORDING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_RECORDING', tabId: message.tabId || tabs[0].id });
    });
  }

  if (message.type === 'START_AUTO_DETECTION' && message.tabId) {
    // Enforce single-tab: stop any currently running auto detection first
    if (currentAutoTabId && currentAutoTabId !== message.tabId) {
      chrome.tabs.sendMessage(currentAutoTabId, { type: 'STOP_AUTO_DETECTION' }).catch(() => {});
      updateStorage((data) => {
        const idx = data.autoTabs?.indexOf(currentAutoTabId) ?? -1;
        if (idx === -1) return false;
        data.autoTabs.splice(idx, 1);
        return true;
      });
    }
    currentAutoTabId = message.tabId;
    chrome.tabs.sendMessage(message.tabId, { type: 'START_AUTO_DETECTION', selector: message.selector, pattern: message.pattern, tabId: message.tabId, soundEnabled: message.soundEnabled, soundVolume: message.soundVolume }).catch(() => {});
  }

  if (message.type === 'REPLAY_CLICKS' && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, { type: 'REPLAY_CLICKS', pattern: message.pattern, repeat: message.repeat, delayMs: message.delayMs, tabId: message.tabId, soundEnabled: message.soundEnabled, soundVolume: message.soundVolume }).catch(() => {});
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
    const tabId = message.tabId;
    if (tabId && debugAttachedTabs.has(tabId)) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      debugAttachedTabs.delete(tabId);
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

  if (message.type === 'PLAY_ALERT') {
    playAlertViaOffscreen(message.volume ?? 0.7).catch(() => {});
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
