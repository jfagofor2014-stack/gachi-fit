import { getAll, get, put, remove } from '../db.js';
import { estimate1RM, sensoryScore } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { SENSORY_TAGS } from './workout.js';

export async function renderReview(el) {
  const workouts = (await getAll('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
  const sets = await getAll('sets');
  const exercises = await getAll('exercises');
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  if (!workouts.length) {
    el.innerHTML = `<h2 class="view-title">振り返り</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  el.innerHTML = `<h2 class="view-title">振り返り</h2>` +
    workouts.map((w) => {
      const wSets = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.createdAt - b.createdAt);
      return `<div class="card">
        <strong>${w.date}</strong>
        <div class="field" style="margin-top:8px"><label>ワークアウトメモ</label>
          <input class="input wnote" data-w="${w.id}" value="${escapeHtml(w.note || '')}" placeholder="この日の振り返り" /></div>
        ${wSets.map((s) => `<div class="list-item">
            <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}</span>
            <span>
              <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
              <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
            </span>
          </div>`).join('') || '<p class="muted">セットなし</p>'}
      </div>`;
    }).join('');

  el.querySelectorAll('.wnote').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const w = await get('workouts', inp.dataset.w);
      if (w) { w.note = inp.value; await put('workouts', w); }
    }));

  el.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const setId = b.dataset.del;
      await remove('sets', setId);
      const logs = await getAll('sensoryLogs');
      for (const l of logs.filter((l) => l.setId === setId)) await remove('sensoryLogs', l.id);
      renderReview(el);
    }));

  el.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openEditor(el, b.dataset.edit)));
}

async function openEditor(el, setId) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { core: 3, muscleLoad: 3, rom: 'full', tags: [], note: '' };
  const tagSet = new Set(log.tags || []);

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="row">
      <div class="field"><label>重量(kg)</label><input id="e-weight" class="input" type="number" value="${set.weight}" /></div>
      <div class="field"><label>回数</label><input id="e-reps" class="input" type="number" value="${set.reps}" /></div>
    </div>
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
    const weight = parseFloat(modal.querySelector('#e-weight').value);
    const reps = parseInt(modal.querySelector('#e-reps').value, 10);
    const core = parseInt(modal.querySelector('#e-core').value, 10);
    const load = parseInt(modal.querySelector('#e-load').value, 10);
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    set.weight = weight; set.reps = reps; set.estimated1RM = estimate1RM(weight, reps);
    await put('sets', set);
    const newLog = { id: log.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      setId, core, muscleLoad: load, rom,
      score: sensoryScore({ core, muscleLoad: load, rom }),
      note: modal.querySelector('#e-note').value, tags: [...tagSet] };
    await put('sensoryLogs', newLog);
    modal.remove();
    renderReview(el);
  });
}
