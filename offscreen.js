// Offscreen document — plays beep.wav via HTMLAudioElement.
// Volume is written to chrome.storage.local by the background script before
// this document is created, so it is always present when this script runs.
// HTMLAudioElement is used instead of Web Audio API because AudioContext
// requires user activation to resume, which offscreen documents never have.

chrome.storage.local.get('_alertVolume', (result) => {
  const vol = Math.min(1, Math.max(0, result._alertVolume ?? 0.7));
  const audio = new Audio(chrome.runtime.getURL('beep.wav'));
  audio.volume = vol;
  audio.play().catch(() => {});
});
