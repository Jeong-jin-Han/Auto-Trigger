// Offscreen document — synthesizes a beep tone using Web Audio API.
// Volume is passed via URL search param (?vol=0.7) so no message-passing is
// needed. The AudioContext works immediately in an extension page (no user
// activation required).

function playBeep(vol) {
  try {
    const ctx = new AudioContext();
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
}

window.addEventListener('DOMContentLoaded', () => {
  const read = (cb) => {
    chrome.storage.session.get('_alertVolume', (r) => {
      if (r._alertVolume != null) { cb(r._alertVolume); return; }
      chrome.storage.local.get('_alertVolume', (r2) => cb(r2._alertVolume ?? 0.7));
    });
  };
  read((vol) => playBeep(Math.min(1, Math.max(0, vol))));
});
