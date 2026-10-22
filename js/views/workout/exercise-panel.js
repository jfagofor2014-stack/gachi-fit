import { getAll } from '../../db.js';
import { escapeHtml } from '../../lib/html.js';
import { localDateStr } from '../../lib/localdate.js';
import { categoryKey, categoryVolumeForDate,
  maxCategoryVolumeExcludingDate, VOLUME_START_DATE } from '../../lib/volume.js';

// 記録タブ上部に固定する種目ヘッダー。タップで種目選択シートを開く
export function exerciseHeaderHtml() {
  return `<div class="ex-header" id="w-ex-header">
    <button type="button" class="ex-header-main" id="w-ex-toggle" aria-label="種目を選ぶ">
      <div><span class="ex-part-label" id="w-ex-part"></span><span class="ex-header-name" id="w-ex-name">—</span></div>
      <span class="caret">▾</span>
    </button>
    <div class="muted ex-course" id="w-ex-course" hidden></div>
    <div class="ex-header-stats">
      <span class="muted" id="w-pr">PR: —</span>
      <span class="muted" id="w-vol-text"></span>
    </div>
    <div class="volbar"><div class="volbar-fill" id="w-vol-fill" style="width:0%"></div></div>
    <div id="w-cues"></div>
  </div>`;
}

// 種目名・部位・PR・部位別ボリューム・意識ポイントを表示する。
// 集計は全種目で行う（絞り込み後の種目だと過去のセットが「その他」に化ける）
export function createExercisePanel(el, { allExercises, prs, onOpen }) {
  let currentId = null;
  el.querySelector('#w-ex-toggle').addEventListener('click', () => onOpen());

  async function refresh() {
    const ex = allExercises.find((e) => e.id === currentId);
    el.querySelector('#w-ex-name').textContent = ex ? ex.name : '—';
    el.querySelector('#w-ex-part').textContent = ex ? categoryKey(ex) : '';
    const pr = prs[currentId];
    el.querySelector('#w-pr').innerHTML = pr
      ? `PR <span class="pr-badge">${pr.toFixed(1)}kg</span>`
      : 'PR: 記録なし';
    el.querySelector('#w-cues').innerHTML =
      (ex?.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');

    const cat = categoryKey(ex);
    const sets = await getAll('sets');
    const workouts = await getAll('workouts');
    const exById = Object.fromEntries(allExercises.map((e) => [e.id, e]));
    const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
    const today = localDateStr();
    const todayVol = categoryVolumeForDate(sets, exById, wkById, today)[cat] || 0;
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today, VOLUME_START_DATE)[cat] || 0;
    const pct = pastMax > 0 ? Math.min(100, (todayVol / pastMax) * 100) : (todayVol > 0 ? 100 : 0);
    const beat = todayVol > pastMax && todayVol > 0;
    el.querySelector('#w-vol-fill').style.width = `${pct}%`;
    el.querySelector('#w-vol-text').innerHTML =
      `${escapeHtml(cat)} ${Math.round(todayVol)} / ${pastMax > 0 ? Math.round(pastMax) : '—'}${beat ? ' <span class="pr-badge">自己ベスト！</span>' : ''}`;
  }

  return {
    refresh,
    setExercise(id) { currentId = id; return refresh(); },
    currentExerciseId: () => currentId,
    // ヘッダーにコース名と、スーパーセットの組（A ⇄ B）を出す
    setContext({ courseName, supersetNames, onDissolve }) {
      const box = el.querySelector('#w-ex-course');
      if (supersetNames && supersetNames.length) {
        box.innerHTML = `スーパーセット: ${supersetNames.map(escapeHtml).join(' ⇄ ')}
          <button type="button" class="btn ss-dissolve" id="w-ss-dissolve">組を解く</button>`;
        box.querySelector('#w-ss-dissolve').addEventListener('click', () => onDissolve && onDissolve());
      } else {
        box.innerHTML = courseName ? `コース: ${escapeHtml(courseName)}` : '';
      }
      box.hidden = box.innerHTML === '';
    },
  };
}
