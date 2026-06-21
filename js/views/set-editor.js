import { get, getAll, put, uid } from '../db.js';
import { estimate1RM, sensoryScore } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { SENSORY_TAGS } from './workout.js';
import { createStepper } from './components.js';

// セット編集モーダルを開く。保存/キャンセルで閉じ、変更時に onDone() を呼ぶ。
export async function openSetEditor(setId, onDone) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { core: 3, muscleLoad: 3, rom: 'full', tags: [], note: '' };
  const tagSet = new Set(log.tags || []);

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="field"><label>重量(kg)</label><div id="e-weight"></div></div>
    <div class="field"><label>回数</label><div id="e-reps"></div></div>
    <div class="field"><label>腹圧保持(1-5)</label><input id="e-core" class="input" type="number" min="1" max="5" value="${log.core}" /></div>
    <div class="field"><label>対象筋への負荷(1-5)</label><input id="e-load" class="input" type="number" min="1" max="5" value="${log.muscleLoad}" /></div>
    <div class="field"><label>可動域 ROM</label>
      <div class="seg" id="e-rom">
        <button data-v="full" class="${log.rom === 'full' ? 'sel' : ''}">フル</button>
        <button data-v="partial" class="${log.rom === 'partial' ? 'sel' : ''}">部分</button>
        <button data-v="cheating" class="${log.rom === 'cheating' ? 'sel' : ''}">チーティング</button>
      </div></div>
    <div class="field"><label>定型タグ</label><div id="e-tags">
      ${SENSORY_TAGS.map((t) => `<button type="button" class="chip chip-tag ${tagSet.has(t) ? 'sel' : ''}" data-tag="${t}">${t}</button>`).join('')}
    </div></div>
    <div class="field"><label>メモ</label><input id="e-note" class="input" value="${escapeHtml(log.note || '')}" /></div>
    <div id="e-error" class="error"></div>
    <button id="e-save" class="btn btn-primary btn-block">保存</button>
    <button id="e-cancel" class="btn btn-block" style="margin-top:8px">キャンセル</button>`;
  document.body.appendChild(modal);

  const weightStepper = createStepper(modal.querySelector('#e-weight'), { value: set.weight, step: 2.5, min: 0 });
  const repsStepper = createStepper(modal.querySelector('#e-reps'), { value: set.reps, step: 1, min: 0 });

  let rom = log.rom;
  modal.querySelectorAll('#e-rom button').forEach((bb) =>
    bb.addEventListener('click', () => {
      modal.querySelectorAll('#e-rom button').forEach((x) => x.classList.remove('sel'));
      bb.classList.add('sel'); rom = bb.dataset.v;
    }));
  modal.querySelectorAll('#e-tags .chip-tag').forEach((bb) =>
    bb.addEventListener('click', () => {
      const t = bb.dataset.tag;
      if (tagSet.has(t)) { tagSet.delete(t); bb.classList.remove('sel'); }
      else { tagSet.add(t); bb.classList.add('sel'); }
    }));

  modal.querySelector('#e-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#e-save').addEventListener('click', async () => {
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    const core = parseInt(modal.querySelector('#e-core').value, 10);
    const load = parseInt(modal.querySelector('#e-load').value, 10);
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    set.weight = weight; set.reps = reps; set.estimated1RM = estimate1RM(weight, reps);
    await put('sets', set);
    const newLog = { id: log.id || uid(), setId, core, muscleLoad: load, rom,
      score: sensoryScore({ core, muscleLoad: load, rom }),
      note: modal.querySelector('#e-note').value, tags: [...tagSet] };
    await put('sensoryLogs', newLog);
    modal.remove();
    onDone && onDone();
  });
}
