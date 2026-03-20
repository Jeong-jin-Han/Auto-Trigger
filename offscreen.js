// Offscreen document — plays bundled beep.wav.
// Uses BroadcastChannel (more reliable than chrome.runtime.sendMessage
// between service worker and offscreen document).

const bc = new BroadcastChannel('auto_trigger_audio');
bc.onmessage = (event) => {
  const volume = Math.min(1, Math.max(0, event.data?.volume ?? 0.7));
  const audio = new Audio(chrome.runtime.getURL('beep.wav'));
  audio.volume = volume;
  audio.play().catch((e) => console.error('[AutoTrigger] offscreen play failed:', e));
};
