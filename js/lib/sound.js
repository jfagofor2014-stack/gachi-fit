// 残り秒数がアラート対象かどうか（純粋関数）
export function shouldBeep(remaining, thresholdSec = 10) {
  return remaining === thresholdSec;
}

// ビープ音を1回再生する（Web Audio API、外部ファイル不要。ブラウザ専用）
export function playBeep({ frequency = 880, durationMs = 150 } = {}) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
  osc.onended = () => ctx.close();
}
