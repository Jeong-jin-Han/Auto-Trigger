// Offscreen document — synthesizes a beep tone using Web Audio API.
// Volume is passed via URL search param (?vol=0.7) so no message-passing is
// needed. The AudioContext works immediately in an extension page (no user
// activation required).

window.addEventListener('DOMContentLoaded', () => {
  const vol = Math.min(1, Math.max(0, parseFloat(new URLSearchParams(location.search).get('vol')) || 0.7));
  try {
    const ctx  = new AudioContext();
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
  } catch (_) {}
});
