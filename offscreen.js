// Offscreen document — plays a synthesized beep via Web Audio API.
// Volume is written to chrome.storage.local by the background before this
// document is created, so it is always available when this script runs.

chrome.storage.local.get('_alertVolume', (result) => {
  const vol = Math.min(1, Math.max(0, result._alertVolume ?? 0.7));
  try {
    const ctx  = new AudioContext();
    ctx.resume().then(() => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    });
  } catch (_) {}
});
