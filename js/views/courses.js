import { getAll, put, remove, uid } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { COURSE_MIN_EX, COURSE_MAX_EX } from '../lib/constants.js';
import { mostUsedExerciseIds, matchExerciseNamesToIds } from '../lib/courses.js';
import { DEFAULT_COURSE_PRESETS, missingExerciseNames } from '../lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../lib/exercisePresets.js';

const COURSE_DEFAULT_EX = 4;

export async function renderCourses(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');

  el.innerHTML = `
    <div class="card">
      <strong>コース</strong>
      <div class="field mt-2"><label>プリセットから作成</label>
        <div id="course-presets"></div></div>
      <div id="course-preset-msg" class="muted mt-1"></div>
      <div class="field mt-2"><label>コース名</label>
        <input id="course-name" class="input" placeholder="例: 胸・肩コース" /></div>
      <div id="course-slots" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="course-slot-add" class="btn">＋ 種目を追加</button>
        <button type="button" id="course-slot-remove" class="btn">− 種目を削除</button>
      </div>
      <button type="button" id="course-autofill" class="btn btn-block mt-2">よく使う種目で自動セット</button>
      <div id="course-error" class="error"></div>
      <button id="course-save" class="btn btn-primary btn-block mt-2">コースを保存</button>
      <div id="course-list" class="mt-3"></div>
    </div>`;

  if (!exercises.length) {
    el.querySelector('#course-slots').innerHTML = '<p class="muted">先に種目を登録してください。</p>';
    el.querySelector('#course-save').disabled = true;
    el.querySelector('#course-autofill').disabled = true;
    el.querySelector('#course-slot-add').disabled = true;
    el.querySelector('#course-slot-remove').disabled = true;
    renderPresets();
    renderCourseList();
    return;
  }

  let courseSlots = Array.from({ length: COURSE_DEFAULT_EX }, () => exercises[0].id);

  function renderCourseSlots() {
    const wrap = el.querySelector('#course-slots');
    wrap.innerHTML = courseSlots.map((exId, i) => `
      <div class="field"><label>種目 ${i + 1}</label>
        <select id="course-slot-${i}" class="input">
          ${exercises.map((e) => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>`).join('');
    courseSlots.forEach((_, i) => {
      el.querySelector(`#course-slot-${i}`).addEventListener('change', (e) => {
        courseSlots[i] = e.target.value;
      });
    });
    el.querySelector('#course-slot-add').disabled = courseSlots.length >= COURSE_MAX_EX;
    el.querySelector('#course-slot-remove').disabled = courseSlots.length <= COURSE_MIN_EX;
  }

  el.querySelector('#course-slot-add').addEventListener('click', () => {
    if (courseSlots.length < COURSE_MAX_EX) courseSlots.push(exercises[0].id);
    renderCourseSlots();
  });
  el.querySelector('#course-slot-remove').addEventListener('click', () => {
    if (courseSlots.length > COURSE_MIN_EX) courseSlots.pop();
    renderCourseSlots();
  });

  el.querySelector('#course-autofill').addEventListener('click', () => {
    const validExerciseIds = new Set(exercises.map((e) => e.id));
    const usableSets = sets.filter((s) => validExerciseIds.has(s.exerciseId));
    const topIds = mostUsedExerciseIds(usableSets, courseSlots.length);
    courseSlots = courseSlots.map((exId, i) => topIds[i] || exId);
    renderCourseSlots();
  });

  el.querySelector('#course-save').addEventListener('click', async () => {
    const name = el.querySelector('#course-name').value.trim();
    const err = el.querySelector('#course-error');
    if (!name) { err.textContent = 'コース名を入力してください'; return; }
    if (courseSlots.some((id) => !id)) { err.textContent = 'すべてのスロットで種目を選択してください'; return; }
    err.textContent = '';
    await put('courses', { id: uid(), name, exerciseIds: [...courseSlots] });
    renderCourses(el);
  });

  async function renderCourseList() {
    const courses = await getAll('courses');
    const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
    el.querySelector('#course-list').innerHTML = courses.map((c) => `
      <div class="card">
        <div class="list-item" style="border:none;padding:0">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <div class="muted">${c.exerciseIds.map((id) => escapeHtml(nameOf(id))).join('、')}</div>
          </div>
          <button class="btn btn-danger btn-sm" data-course-del="${c.id}">削除</button>
        </div>
      </div>`).join('') || '<p class="muted">まだコースがありません。</p>';
    el.querySelectorAll('[data-course-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('courses', b.dataset.courseDel); renderCourseList(); }));
  }

  function renderPresets() {
    el.querySelector('#course-presets').innerHTML = DEFAULT_COURSE_PRESETS
      .map((c) => `<span class="chip chip-tag" data-preset-course="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>`).join('');
    el.querySelectorAll('[data-preset-course]').forEach((chip) =>
      chip.addEventListener('click', () => createFromPreset(chip.dataset.presetCourse)));
  }

  async function createFromPreset(presetName) {
    const preset = DEFAULT_COURSE_PRESETS.find((c) => c.name === presetName);
    if (!preset) return;

    // 未登録の種目を種目プリセットから補って登録する
    const current = await getAll('exercises');
    const missing = missingExerciseNames(preset.exercises, current);
    for (const name of missing) {
      const src = DEFAULT_EXERCISE_PRESETS.find((p) => p.name === name);
      if (!src) continue;
      await put('exercises', {
        id: uid(), name: src.name, bodyPart: src.bodyPart, category: src.category,
        cuePresets: [], setPattern: '通常',
      });
    }

    const after = await getAll('exercises');
    const exerciseIds = matchExerciseNamesToIds(preset.exercises, after);
    await put('courses', { id: uid(), name: preset.name, exerciseIds });

    // 画面全体を作り直したあとにメッセージを入れる（再描画で消えないようにするため）
    await renderCourses(el);
    el.querySelector('#course-preset-msg').textContent = missing.length
      ? `${preset.name}コースを作成しました（種目${missing.length}件を追加）`
      : `${preset.name}コースを作成しました`;
  }

  renderPresets();
  renderCourseSlots();
  renderCourseList();
}
