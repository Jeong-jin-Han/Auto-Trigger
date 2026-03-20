// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

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


// ─── Message Listener ─────────────────────────────────────────────────────

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_RECORDING' });
      }
    });
  }

  if (message.type === 'STOP_RECORDING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_RECORDING' });
      }
    });
  }

  if (message.type === 'RESUME_RECORDING') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_RECORDING' });
      }
    });
  }

  if (message.type === 'START_AUTO_DETECTION') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'START_AUTO_DETECTION',
          selector: message.selector,
          pattern: message.pattern
        });
      }
    });
  }

  if (message.type === 'STOP_AUTO_DETECTION') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_AUTO_DETECTION' });
      }
    });
  }

  if (message.type === 'REPLAY_CLICKS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'REPLAY_CLICKS',
          pattern: message.pattern,
          repeat: message.repeat,
          delayMs: message.delayMs
        });
      }
    });
  }

  if (message.type === 'DEBUGGER_CLICK') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ success: false, fallback: true }); return; }
      debuggerClick(tabs[0].id, message.x, message.y, message.hoverX ?? message.x, message.hoverY ?? message.y)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, fallback: true }));
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.type === 'DEBUGGER_DETACH') {
    if (debugTabId !== null) {
      chrome.debugger.detach({ tabId: debugTabId }).catch(() => {});
      debugTabId = null;
    }
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
