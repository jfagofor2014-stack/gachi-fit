import { escapeHtml } from '../../lib/html.js';
import { BODY_PARTS } from '../../lib/constants.js';
import { categoryKey, categoriesWithExercises } from '../../lib/volume.js';
import { sortByUsage } from '../../lib/logging.js';

const COURSE_TAB = '__course__';

// 種目選択シート。部位タブ→種目タイルの2タップで選ぶ。exercises は絞り込み後の種目
export function openExerciseSheet({
  exercises, usage, currentExerciseId, suggestionId, courses, logState, onPick, onCourse, onStartSuperset,
}) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const parts = categoriesWithExercises(exercises, BODY_PARTS);
  const current = byId.get(currentExerciseId);
  let courseIds = logState.courseIds.filter((id) => byId.has(id));
  let tab = current ? categoryKey(current) : parts[0];
  let picking = null; // スーパーセットを組んでいる間は選んだ種目IDの配列

  const sheet = document.createElement('div');
  sheet.className = 'ex-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', '種目を選ぶ');
  document.body.appendChild(sheet);
  const close = () => sheet.remove();

  function tilesFor(key) {
    if (key === COURSE_TAB) return courseIds.map((id) => byId.get(id));
    return sortByUsage(exercises.filter((e) => categoryKey(e) === key), usage);
  }

  function render() {
    const suggestion = !picking && suggestionId && byId.get(suggestionId);
    const tabs = [...(courseIds.length ? [COURSE_TAB] : []), ...parts];
    sheet.innerHTML = `
      <div class="ex-sheet-head">
        <strong>${picking ? `スーパーセットの種目を選ぶ（${picking.length}/4）` : '種目を選ぶ'}</strong>
        <button type="button" class="btn ex-sheet-close" data-close>✕</button>
      </div>
      ${suggestion ? `<button type="button" class="ex-next" data-pick="${escapeHtml(suggestion.id)}">
        <span class="muted">次はこれ？</span><b>${escapeHtml(suggestion.name)}</b></button>` : ''}
      ${picking ? '' : `<div class="field"><select class="input" id="ex-sheet-course" aria-label="コース">
        <option value="">コース: 選択なし</option>
        ${courses.map((c) => `<option value="${escapeHtml(c.id)}" ${logState.courseName === c.name && courseIds.length ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        ${logState.courseName && courseIds.length && !courses.some((c) => c.name === logState.courseName)
          ? `<option value="__temp__" selected>${escapeHtml(logState.courseName)}</option>` : ''}
      </select></div>`}
      <div class="ex-tabs">${tabs.map((t) => `<button type="button" class="ex-tab ${t === tab ? 'sel' : ''}" data-tab="${escapeHtml(t)}">${t === COURSE_TAB ? 'コース' : escapeHtml(t)}</button>`).join('')}</div>
      <div class="ex-tiles">${tilesFor(tab).filter(Boolean).map((e) => {
        const chosen = picking && picking.includes(e.id);
        return `<button type="button" class="ex-tile ${e.id === currentExerciseId && !picking ? 'cur' : ''} ${chosen ? 'sel' : ''}" data-pick="${escapeHtml(e.id)}">
          ${(usage.get(e.id) || 0) > 0 ? '<span class="ex-recent">最近</span>' : ''}${escapeHtml(e.name)}</button>`;
      }).join('')}</div>
      ${picking
        ? `<button type="button" class="btn btn-primary btn-block mt-2" data-start ${picking.length < 2 ? 'disabled' : ''}>この組で始める</button>
           <button type="button" class="btn btn-block mt-1" data-cancel-ss>やめる</button>`
        : `<button type="button" class="btn btn-block mt-2" data-ss>スーパーセットを組む</button>`}`;

    sheet.querySelector('[data-close]').addEventListener('click', close);
    sheet.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    sheet.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.pick;
        if (picking) {
          if (picking.includes(id)) picking = picking.filter((x) => x !== id);
          else if (picking.length < 4) picking = [...picking, id];
          render();
          return;
        }
        close();
        onPick(id);
      }));
    const courseSel = sheet.querySelector('#ex-sheet-course');
    if (courseSel) {
      courseSel.addEventListener('change', () => {
        if (courseSel.value === '__temp__') return;
        const c = courses.find((x) => x.id === courseSel.value);
        courseIds = c ? c.exerciseIds.filter((id) => byId.has(id)) : [];
        onCourse({ courseIds: c ? c.exerciseIds : [], courseName: c ? c.name : '' });
        tab = courseIds.length ? COURSE_TAB : tab;
        render();
      });
    }
    const ss = sheet.querySelector('[data-ss]');
    if (ss) ss.addEventListener('click', () => { picking = currentExerciseId && byId.has(currentExerciseId) ? [currentExerciseId] : []; render(); });
    const cancel = sheet.querySelector('[data-cancel-ss]');
    if (cancel) cancel.addEventListener('click', () => { picking = null; render(); });
    const start = sheet.querySelector('[data-start]');
    if (start) start.addEventListener('click', () => { const ids = picking; close(); onStartSuperset(ids); });
  }
  render();
}
