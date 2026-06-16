// 残り秒のカウントダウン。onTick(remaining)/onDone を呼ぶ。
export function createTimer({ onTick, onDone } = {}) {
  let intervalId = null;
  let remaining = 0;

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start(seconds) {
    stop();
    remaining = seconds;
    onTick?.(remaining);
    intervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        onTick?.(0);
        onDone?.();
      } else {
        onTick?.(remaining);
      }
    }, 1000);
  }

  return {
    start,
    stop,
    isRunning: () => intervalId !== null,
    getRemaining: () => remaining,
  };
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
