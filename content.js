// Prevent double injection
if (window.__autoClickInjected) {
  // Already injected, skip
} else {
  window.__autoClickInjected = true;

  let isRecording = false;
  let isAutoDetecting = false;
  let isReplaying = false;
  let recordedClicks = [];
  let videoObserver = null;

  // ─── Recording Mode ───────────────────────────────────────────────────────

  function onClickRecord(event) {
    if (!isRecording) return;

    const el = event.target;
    const rect = el.getBoundingClientRect();
    const clickData = {
      x: event.clientX,
      y: event.clientY,
      selector: getSelector(el),
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      timestamp: Date.now()
    };

    recordedClicks.push(clickData);
    chrome.runtime.sendMessage({ type: 'CLICK_RECORDED', click: clickData });

    // Visual feedback
    showClickBadge(event.clientX, event.clientY, recordedClicks.length);
  }

  // Returns true for class names that should be excluded from selectors:
  // random/hashed names, or state classes that change based on interaction
  function isDynamicClass(cls) {
    return /[0-9a-f]{6,}/i.test(cls)
        || /^\d/.test(cls)
        || /-(active|hover|open|visible|hidden|focused|selected|expanded|collapsed|playing|paused|loading|buffering)$/.test(cls);
  }

  function getSelector(el) {
    // Walk up the tree to build a stable selector
    const parts = [];
    let node = el;

    while (node && node !== document.body) {
      let part = node.tagName.toLowerCase();

      if (node.id && !isDynamicClass(node.id)) {
        // Stable ID — use it and stop; it should be unique enough
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }

      // Filter out dynamic classes
      const stableClasses = Array.from(node.classList)
        .filter((c) => !isDynamicClass(c));

      if (stableClasses.length > 0) {
        part += '.' + stableClasses.map(CSS.escape).join('.');
      } else {
        // No stable classes — disambiguate with nth-child
        const siblings = Array.from(node.parentElement?.children || [])
          .filter((s) => s.tagName === node.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(part);
      node = node.parentElement;
    }

    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function showClickBadge(x, y, count) {
    const badge = document.createElement('div');
    badge.textContent = count;
    badge.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #ff4444;
      color: white;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      pointer-events: none;
      transform: translate(-50%, -50%);
      animation: autoclick-fade 1s ease-out forwards;
    `;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 1000);
  }

  // ─── Auto Detection Mode ──────────────────────────────────────────────────

  let autoClickSelector = '';
  let autoClickPattern  = [];

  function startAutoDetection(selector, pattern) {
    autoClickSelector = selector || '';
    autoClickPattern  = pattern  || [];
    isAutoDetecting = true;
    attachVideoListeners();
    // Also watch for dynamically added videos
    videoObserver = new MutationObserver(() => {
      attachVideoListeners();
    });
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopAutoDetection() {
    isAutoDetecting = false;
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
  }

  function attachVideoListeners() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (!video.__autoClickListening) {
        video.__autoClickListening = true;
        // Standard: fires on most sites
        video.addEventListener('ended', onVideoEnded);
        // Fallback for YouTube: 'ended' is intercepted, detect near-end via timeupdate
        video.addEventListener('timeupdate', () => {
          if (!isAutoDetecting || !video.duration || video.paused) return;
          if (video.currentTime >= video.duration - 0.5) onVideoEnded();
        });
      }
    });
  }

  let lastVideoEndedAt = 0;

  function onVideoEnded() {
    if (!isAutoDetecting) return;

    // Debounce: ignore if triggered again within 5 seconds
    const now = Date.now();
    if (now - lastVideoEndedAt < 5000) return;
    lastVideoEndedAt = now;

    // Notify side panel (for log display only)
    chrome.runtime.sendMessage({ type: 'VIDEO_ENDED' });

    // Perform the click right here in the page
    if (autoClickSelector) {
      setTimeout(() => {
        let el = null;
        try { el = document.querySelector(autoClickSelector); } catch (_) {}
        if (el) {
          performClick({ selector: autoClickSelector, x: 0, y: 0 }, 'auto', 1, 1);
        } else {
          chrome.runtime.sendMessage({ type: 'CLICK_FAILED', selector: autoClickSelector });
        }
      }, 800);
    } else if (autoClickPattern.length > 0) {
      setTimeout(() => replayClicks(autoClickPattern, 1, 'auto'), 800);
    }
  }

  // ─── Replay Mode ──────────────────────────────────────────────────────────

  async function replayClicks(pattern, repeat, source, delayMs) {
    if (source !== 'auto' && isReplaying) return;
    if (source !== 'auto') isReplaying = true;
    const between = typeof delayMs === 'number' ? delayMs : 500;
    for (let r = 0; r < repeat; r++) {
      for (let i = 0; i < pattern.length; i++) {
        if (i === 0) {
          await waitMs(300);
        } else {
          const interval = pattern[i].timestamp - pattern[i - 1].timestamp;
          await waitMs(Math.min(Math.max(interval, 100), 10000));
        }
        await performClick(pattern[i], source, r + 1, repeat);
      }
      if (r < repeat - 1) await waitMs(between);
    }
    if (source !== 'auto') {
      isReplaying = false;
      chrome.runtime.sendMessage({ type: 'DEBUGGER_DETACH' });
      chrome.runtime.sendMessage({ type: 'REPLAY_DONE', repeat });
    }
  }

  async function performClick(click, source, step, total) {
    let el = null;
    let method = '';

    try {
      el = document.querySelector(click.selector);
      if (el) method = 'selector';
    } catch (_) {}

    if (!el) {
      el = document.elementFromPoint(click.x, click.y);
      if (el) method = 'coords';
    }

    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;

      const playerEl = document.querySelector('#movie_player')
                    || document.querySelector('.html5-video-player')
                    || document.querySelector('video');
      let hoverX = cx, hoverY = cy;
      if (playerEl) {
        const pr = playerEl.getBoundingClientRect();
        hoverX = pr.left + pr.width  / 2;
        hoverY = pr.top  + pr.height * 0.4;
      }
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'DEBUGGER_CLICK', x: cx, y: cy, hoverX, hoverY },
          resolve
        );
      });
      // Fallback to synthetic click if debugger was cancelled by user
      if (resp?.fallback) {
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
      }

      showClickBadge(cx, cy, '▶');
      chrome.runtime.sendMessage({ type: 'CLICK_PERFORMED', method, source, step, total });
    } else {
      chrome.runtime.sendMessage({ type: 'CLICK_FAILED', selector: click.selector });
    }
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── CSS animation ────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @keyframes autoclick-fade {
      0%   { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
  `;
  document.head.appendChild(style);

  // ─── Message Listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'START_RECORDING':
        isRecording = true;
        recordedClicks = [];
        document.removeEventListener('click', onClickRecord, true); // prevent duplicates
        document.addEventListener('click', onClickRecord, true);
        break;

      case 'STOP_RECORDING':
        isRecording = false;
        document.removeEventListener('click', onClickRecord, true);
        break;

      case 'RESUME_RECORDING':
        isRecording = true;
        document.removeEventListener('click', onClickRecord, true); // prevent duplicates
        document.addEventListener('click', onClickRecord, true);
        break;

      case 'START_AUTO_DETECTION':
        startAutoDetection(message.selector, message.pattern);
        break;

      case 'STOP_AUTO_DETECTION':
        stopAutoDetection();
        break;

      case 'REPLAY_CLICKS':
        replayClicks(message.pattern, message.repeat || 1, 'manual', message.delayMs);
        break;
    }
  });
}
