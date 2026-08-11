import { getAll } from '../../db.js';
import { escapeHtml } from '../../lib/html.js';
import { BODY_PARTS } from '../../lib/constants.js';
import { localDateStr } from '../../lib/localdate.js';
import { categoryKey, categoriesWithExercises, categoryVolumeForDate,
  maxCategoryVolumeExcludingDate, VOLUME_START_DATE } from '../../lib/volume.js';

export function exerciseHeaderHtml(courses) {
  return `<div class="ex-header" id="w-ex-header">
    <div class="ex-header-main" id="w-ex-toggle">
      <div><span class="ex-header-name" id="w-ex-name">—</span>
        <span class="muted" id="w-ex-part"></span></div>
      <span class="muted" id="w-ex-caret">▾</span>
    </div>
    <div class="ex-header-stats">
      <span class="muted" id="w-pr">PR: —</span>
      <span class="muted" id="w-vol-text"></span>
    </div>
    <div class="volbar"><div class="volbar-fill" id="w-vol-fill" style="width:0%"></div></div>
    <div class="ex-picker" id="w-ex-picker" hidden>
      <div class="field"><label>今日のコース</label>
        <select id="w-course" class="input">
          <option value="">選択なし</option>
          ${courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select></div>
      <div id="w-course-exercises" class="mt-1"></div>
      <div class="field mt-2"><label>部位</label>
        <div class="seg" id="w-ex-part-seg"></div></div>
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input"></select></div>
      <div id="w-cues"></div>
    </div>
  </div>`;
}

export function createExercisePanel(el, { exercises, courses, prs, onExerciseChange }) {
  const partGroups = {};
  for (const e of exercises) (partGroups[categoryKey(e)] ||= []).push(e);
  const parts = categoriesWithExercises(exercises, BODY_PARTS);
  let currentPart = parts[0];

  const picker = el.querySelector('#w-ex-picker');
  const exSelect = el.querySelector('#w-ex');

  function renderPartSeg() {
    el.querySelector('#w-ex-part-seg').innerHTML = parts
      .map((p) => `<button data-p="${escapeHtml(p)}" class="${p === currentPart ? 'sel' : ''}">${escapeHtml(p)}</button>`).join('');
    el.querySelectorAll('#w-ex-part-seg button').forEach((b) =>
      b.addEventListener('click', () => {
        currentPart = b.dataset.p;
        renderPartSeg();
        renderExSelect();
        refresh();
      }));
  }

  function renderExSelect() {
    const list = partGroups[currentPart] || [];
    exSelect.innerHTML = list
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('');
  }

  function showExerciseButtons(ids) {
    const box = el.querySelector('#w-course-exercises');
    const items = ids.map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
    box.innerHTML = items
      .map((e) => `<button type="button" class="btn btn-sm" data-course-ex="${e.id}" style="margin:0 6px 6px 0">${escapeHtml(e.name)}</button>`).join('');
    box.querySelectorAll('[data-course-ex]').forEach((b) =>
      b.addEventListener('click', () => selectExercise(b.dataset.courseEx)));
  }

  function selectExercise(exId) {
    const ex = exercises.find((e) => e.id === exId);
    if (!ex) return;
    currentPart = categoryKey(ex);
    renderPartSeg();
    renderExSelect();
    exSelect.value = exId;
    refresh();
  }

  async function refresh() {
    const exId = exSelect.value;
    const ex = exercises.find((e) => e.id === exId);
    el.querySelector('#w-ex-name').textContent = ex ? ex.name : '—';
    el.querySelector('#w-ex-part').textContent = ex ? categoryKey(ex) : '';

    const pr = prs[exId];
    el.querySelector('#w-pr').innerHTML = pr
      ? `PR <span class="pr-badge">${pr.toFixed(1)}kg</span>`
      : 'PR: 記録なし';
    el.querySelector('#w-cues').innerHTML =
      (ex?.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');

    const cat = categoryKey(ex);
    const sets = await getAll('sets');
    const workouts = await getAll('workouts');
    const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
    const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
    const today = localDateStr();
    const todayVol = categoryVolumeForDate(sets, exById, wkById, today)[cat] || 0;
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today, VOLUME_START_DATE)[cat] || 0;
    const pct = pastMax > 0 ? Math.min(100, (todayVol / pastMax) * 100) : (todayVol > 0 ? 100 : 0);
    const beat = todayVol > pastMax && todayVol > 0;
    el.querySelector('#w-vol-fill').style.width = `${pct}%`;
    el.querySelector('#w-vol-text').innerHTML =
      `${escapeHtml(cat)} ${Math.round(todayVol)} / ${pastMax > 0 ? Math.round(pastMax) : '—'}${beat ? ' <span class="pr-badge">自己ベスト！</span>' : ''}`;

    if (onExerciseChange) onExerciseChange(exId);
  }

  el.querySelector('#w-ex-toggle').addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    el.querySelector('#w-ex-caret').textContent = picker.hidden ? '▾' : '▴';
  });
  exSelect.addEventListener('change', refresh);
  el.querySelector('#w-course').addEventListener('change', () => {
    const course = courses.find((c) => c.id === el.querySelector('#w-course').value);
    if (!course) { el.querySelector('#w-course-exercises').innerHTML = ''; return; }
    showExerciseButtons(course.exerciseIds);
  });

  renderPartSeg();
  renderExSelect();

  return {
    refresh,
    selectExercise,
    currentExerciseId: () => exSelect.value,
    openPicker: () => { picker.hidden = false; el.querySelector('#w-ex-caret').textContent = '▴'; },
    setCourse: (courseId) => {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return;
      el.querySelector('#w-course').value = courseId;
      showExerciseButtons(course.exerciseIds);
    },
    showExerciseButtons,
  };
}
