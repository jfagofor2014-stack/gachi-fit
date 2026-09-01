// [−] 数値input [＋] のステッパーを container に描画する。
// 0 は空欄で表示し、プレースホルダの 0 を見せる（手入力時に 0 を消す手間をなくすため）
export function createStepper(container, { value = 0, step = 1, min = 0, onChange } = {}) {
  container.classList.add('stepper');
  const display = (v) => (v === 0 ? '' : v);
  container.innerHTML = `
    <button type="button" class="stepper-btn" data-dir="-1">−</button>
    <input class="stepper-input" type="number" inputmode="decimal" placeholder="0" value="${display(value)}" />
    <button type="button" class="stepper-btn" data-dir="1">＋</button>`;
  const input = container.querySelector('.stepper-input');
  const fix = (n) => Math.round(n * 100) / 100;
  const read = () => { const n = parseFloat(input.value); return Number.isFinite(n) ? n : 0; };
  const emit = () => onChange && onChange(read());
  container.querySelectorAll('.stepper-btn').forEach((b) =>
    b.addEventListener('click', () => {
      let n = read() + step * Number(b.dataset.dir);
      if (n < min) n = min;
      input.value = display(fix(n));
      emit();
    }));
  input.addEventListener('input', emit);
  return {
    get: read,
    set: (v) => { input.value = display(v); },
  };
}
