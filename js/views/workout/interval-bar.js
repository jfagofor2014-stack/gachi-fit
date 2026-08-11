import { createTimer, formatTime } from '../../timer.js';
import { shouldBeep, shouldFinalBeep, playBeep } from '../../lib/sound.js';

let intervalTimer;

// 折りたたみ内に置く秒数セグメント
export function intervalSecsHtml(choices, defaultSec) {
  return `<div class="seg" id="w-int-secs">
    ${choices.map((s) => `<button data-s="${s}" class="${s === defaultSec ? 'sel' : ''}">${s}秒</button>`).join('')}
  </div>`;
}

// 画面下部に固定するタイマーバー
export function intervalBarHtml(defaultSec) {
  return `<div class="interval-bar">
    <span class="interval-time" id="w-timer">${formatTime(defaultSec)}</span>
    <button id="w-int-start" class="btn btn-primary interval-btn">開始</button>
    <button id="w-int-stop" class="btn interval-btn">停止</button>
  </div>`;
}

// 秒数セグメントとバーを結線する。再描画時は前のタイマーを止めてから作り直す
export function initIntervalBar(el, defaultSec) {
  if (intervalTimer) intervalTimer.stop();
  const state = { interval: defaultSec };
  const timerEl = el.querySelector('#w-timer');

  el.querySelectorAll('#w-int-secs button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('#w-int-secs button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      state.interval = Number(b.dataset.s);
      timerEl.textContent = formatTime(state.interval);
    }));

  intervalTimer = createTimer({
    onTick: (s) => {
      timerEl.textContent = formatTime(s);
      if (shouldFinalBeep(s)) playBeep({ frequency: 1200, durationMs: 400 });
      else if (shouldBeep(s)) playBeep();
    },
    onDone: () => { timerEl.textContent = formatTime(state.interval); },
  });

  el.querySelector('#w-int-start').addEventListener('click', () => intervalTimer.start(state.interval));
  el.querySelector('#w-int-stop').addEventListener('click', () => {
    intervalTimer.stop();
    timerEl.textContent = formatTime(state.interval);
  });
}
