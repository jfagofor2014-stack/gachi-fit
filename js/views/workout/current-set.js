import { parseNumberInput } from '../../lib/logging.js';
import { escapeHtml } from '../../lib/html.js';

// 記録済みの札の番号（①〜⑳、それ以降は (21)）
const circled = (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`);
const fmt = (n) => String(Math.round(n * 100) / 100);

export function currentSetHtml() {
  return `<div id="w-chips" class="set-chips"></div>
  <div class="card cur-set">
    <div id="w-cur-heading" class="muted cur-heading"></div>
    <div class="cur-row">
      <button type="button" class="pm" data-adj="weight" data-dir="-1"></button>
      <label class="cur-num"><input id="w-cur-weight" class="cur-input" inputmode="decimal" autocomplete="off" aria-label="重量（kg）" /><span>kg</span></label>
      <button type="button" class="pm" data-adj="weight" data-dir="1"></button>
    </div>
    <div class="cur-row">
      <button type="button" class="pm" data-adj="reps" data-dir="-1">−1</button>
      <label class="cur-num"><input id="w-cur-reps" class="cur-input" inputmode="numeric" autocomplete="off" aria-label="回数" /><span>回</span></label>
      <button type="button" class="pm" data-adj="reps" data-dir="1">＋1</button>
    </div>
    <div id="w-cur-hint" class="muted mt-1"></div>
    <div id="w-cur-error" class="error"></div>
  </div>
  <div class="cur-actions">
    <button type="button" id="w-record" class="btn btn-primary rec-btn">記録する</button>
    <button type="button" id="w-drop" class="btn drop-btn">ドロップ</button>
  </div>
  <div id="w-voice" class="mt-2" style="display:none">
    <button type="button" id="w-voice-btn" class="btn voice-btn">🎤 音声で入力</button>
    <div id="w-voice-status" class="muted mt-1"></div>
  </div>
  <details class="card fold mt-2" id="w-cur-details">
    <summary><strong>詳細（補助回数・メモ）</strong></summary>
    <div class="field mt-2" id="w-cur-assist-wrap"><label>補助回数</label>
      <input id="w-cur-assist" class="input" inputmode="numeric" placeholder="0" /></div>
    <div class="field"><label>メモ（このセット）</label>
      <input id="w-cur-note" class="input" placeholder="例: 最後の2回は浅い" /></div>
  </details>`;
}

// 「今のセット」カード。値の保持と表示だけを受け持ち、保存は onRecord / onDrop に任せる
export function createCurrentSet(el, { getStep, onRecord, onDrop, onChipTap }) {
  const weightIn = el.querySelector('#w-cur-weight');
  const repsIn = el.querySelector('#w-cur-reps');
  const assistIn = el.querySelector('#w-cur-assist');
  const noteIn = el.querySelector('#w-cur-note');
  const recordBtn = el.querySelector('#w-record');
  const dropBtn = el.querySelector('#w-drop');

  const show = (input, v) => { input.value = v > 0 ? fmt(v) : ''; };

  function labelSteps() {
    const step = getStep();
    el.querySelector('[data-adj="weight"][data-dir="-1"]').textContent = `−${step}`;
    el.querySelector('[data-adj="weight"][data-dir="1"]').textContent = `＋${step}`;
  }
  labelSteps();

  el.querySelectorAll('.cur-set [data-adj]').forEach((b) =>
    b.addEventListener('click', () => {
      const isWeight = b.dataset.adj === 'weight';
      const input = isWeight ? weightIn : repsIn;
      const delta = (isWeight ? getStep() : 1) * Number(b.dataset.dir);
      show(input, Math.max(0, parseNumberInput(input.value) + delta));
    }));
  recordBtn.addEventListener('click', () => onRecord());
  dropBtn.addEventListener('click', () => onDrop());

  return {
    setValues({ weight, reps }) {
      if (weight !== null && weight !== undefined) show(weightIn, weight);
      if (reps !== null && reps !== undefined) show(repsIn, reps);
    },
    values() {
      return {
        weight: parseNumberInput(weightIn.value),
        reps: Math.floor(parseNumberInput(repsIn.value)),
        assistedReps: Math.floor(parseNumberInput(assistIn.value)),
        note: noteIn.value.trim(),
      };
    },
    setHeading(text) { el.querySelector('#w-cur-heading').textContent = text; },
    // 記録済みの札。ドロップの連なりは1枚にまとめ、各セットは個別にタップできる
    setChips(slots) {
      const box = el.querySelector('#w-chips');
      box.innerHTML = slots.length
        ? `<span class="muted chips-label">記録済み</span>` + slots.map((sl, i) => {
          const parts = [{ weight: sl.weight, reps: sl.reps }, ...sl.drops];
          const segs = parts.map((p, j) =>
            `<button type="button" class="chip-seg" data-set-id="${escapeHtml(sl.setIds[j])}">${fmt(p.weight)}${j === 0 ? 'kg' : ''}×${p.reps}</button>`);
          return `<span class="set-chip">${circled(i + 1)} ${segs.join('<span class="chip-arrow">→</span>')}</span>`;
        }).join('')
        : '';
      box.querySelectorAll('[data-set-id]').forEach((b) =>
        b.addEventListener('click', () => onChipTap(b.dataset.setId)));
    },
    setMode({ showDrop, showAssist }) {
      dropBtn.hidden = !showDrop;
      el.querySelector('#w-cur-assist-wrap').hidden = !showAssist;
    },
    setBusy(busy) { recordBtn.disabled = busy; dropBtn.disabled = busy; },
    setError(text) { el.querySelector('#w-cur-error').textContent = text; },
    setHint(text) { el.querySelector('#w-cur-hint').textContent = text; },
    clearDetails() { assistIn.value = ''; noteIn.value = ''; },
    refreshStep: labelSteps,
  };
}
