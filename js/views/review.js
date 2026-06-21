import { getAll, get, put, remove } from '../db.js';
import { escapeHtml } from './exercises.js';
import { openSetEditor } from './set-editor.js';

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
    b.addEventListener('click', () => openSetEditor(b.dataset.edit, () => renderReview(el))));
}
