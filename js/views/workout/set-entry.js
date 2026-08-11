import { createStepper } from '../components.js';
import { estimate1RM } from '../../lib/calc.js';
import { escapeHtml } from '../../lib/html.js';

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 3;

const SS_MIN_EX = 2;
const SS_MAX_EX = 4;
const SS_DEFAULT_EX = 2;
const SS_MIN_ROUNDS = 1;
const SS_MAX_ROUNDS = 6;
const SS_DEFAULT_ROUNDS = 3;

function defaultRowValues(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }));
}

export function setEntryHtml() {
  return `<div class="card">
    <div class="seg" id="w-mode-seg">
      <button data-m="normal" class="sel">通常</button>
      <button data-m="superset">スーパーセット</button>
      <button data-m="dropset">ドロップセット</button>
    </div>
    <div id="w-normal-block">
      <div id="w-rows" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-row-add" class="btn">＋ 行を追加</button>
        <button type="button" id="w-row-remove" class="btn">− 行を削除</button>
      </div>
    </div>
    <div id="w-ss-block" style="display:none">
      <div id="w-ss-exercises" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-ss-ex-add" class="btn">＋ 種目を追加</button>
        <button type="button" id="w-ss-ex-remove" class="btn">− 種目を削除</button>
      </div>
      <div id="w-ss-rounds" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-ss-round-add" class="btn">＋ ラウンドを追加</button>
        <button type="button" id="w-ss-round-remove" class="btn">− ラウンドを削除</button>
      </div>
    </div>
    <div class="field mt-3"><label>メモ（任意・全セット共通）</label>
      <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
    <div id="w-error" class="error"></div>
    <button id="w-save" class="btn btn-primary btn-block mt-2">まとめて記録</button>
  </div>`;
}

export function createSetEntry(el, { exercises, onModeChange }) {
  let mode = 'normal';
  let rowValues = defaultRowValues(DEFAULT_ROWS);
  let rowSteppers = [];

  const exerciseName = (id) => exercises.find((e) => e.id === id)?.name || '?';

  function defaultSSExerciseIds() {
    const ids = exercises.slice(0, SS_DEFAULT_EX).map((e) => e.id);
    while (ids.length < SS_DEFAULT_EX) ids.push(exercises[0].id);
    return ids;
  }
  function defaultSSRounds(exIds) {
    return Array.from({ length: SS_DEFAULT_ROUNDS }, () => exIds.map(() => ({ weight: 0, reps: 0 })));
  }
  let ssExerciseIds = defaultSSExerciseIds();
  let ssRounds = defaultSSRounds(ssExerciseIds);
  let ssSteppers = [];

  function refreshRow1RM(i) {
    const rs = rowSteppers[i];
    const w = rs.weight.get();
    const r = rs.reps.get();
    const a = rs.assist && rs.assistOn ? rs.assist.get() : 0;
    const selfReps = r - a;
    el.querySelector(`#w-row-1rm-${i}`).textContent =
      '推定1RM: ' + (w > 0 && selfReps > 0 ? estimate1RM(w, selfReps).toFixed(1) + 'kg' : '-');
  }

  function syncRowValuesFromSteppers() {
    rowSteppers.forEach((rs, i) => {
      rowValues[i] = {
        weight: rs.weight.get(), reps: rs.reps.get(),
        assistedReps: rs.assist && rs.assistOn ? rs.assist.get() : 0,
        assistOn: rs.assist ? rs.assistOn : false,
        weightTouched: rowValues[i] ? rowValues[i].weightTouched : false,
      };
    });
  }

  function renderRows() {
    const wrap = el.querySelector('#w-rows');
    const showAssist = mode !== 'dropset';
    wrap.innerHTML = rowValues.map((rv, i) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">セット ${i + 1}</div>
        <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
        <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
        ${showAssist ? `
        <button type="button" id="w-row-assist-toggle-${i}" class="btn btn-block">補助あり：${rv.assistOn ? 'ON' : 'OFF'}</button>
        <div id="w-row-assist-wrap-${i}" style="display:${rv.assistOn ? 'block' : 'none'};margin-top:8px">
          <label>補助回数</label><div id="w-row-assist-${i}"></div>
        </div>` : ''}
        <div class="muted" id="w-row-1rm-${i}" style="margin-top:6px">推定1RM: -</div>
      </div>`).join('');

    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), {
        value: rv.weight, step: 0.5, min: 0,
        onChange: (v) => {
          refreshRow1RM(i);
          if (mode !== 'normal') return;
          if (i === 0) {
            rowSteppers.forEach((otherRs, j) => {
              if (j > 0 && !rowValues[j].weightTouched) {
                otherRs.weight.set(v);
                rowValues[j].weight = v;
                refreshRow1RM(j);
              }
            });
          } else {
            rowValues[i].weightTouched = true;
          }
        },
      });
      const reps = createStepper(el.querySelector(`#w-row-reps-${i}`), { value: rv.reps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      if (!showAssist) return { weight, reps, assist: null, assistOn: false };
      const assist = createStepper(el.querySelector(`#w-row-assist-${i}`), { value: rv.assistedReps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      const rs = { weight, reps, assist, assistOn: rv.assistOn };
      el.querySelector(`#w-row-assist-toggle-${i}`).addEventListener('click', () => {
        rs.assistOn = !rs.assistOn;
        el.querySelector(`#w-row-assist-toggle-${i}`).textContent = '補助あり：' + (rs.assistOn ? 'ON' : 'OFF');
        el.querySelector(`#w-row-assist-wrap-${i}`).style.display = rs.assistOn ? 'block' : 'none';
        if (!rs.assistOn) assist.set(0);
        refreshRow1RM(i);
      });
      return rs;
    });
    rowValues.forEach((_, i) => refreshRow1RM(i));
    el.querySelector('#w-row-add').disabled = rowValues.length >= MAX_ROWS;
    el.querySelector('#w-row-remove').disabled = rowValues.length <= MIN_ROWS;
  }

  el.querySelector('#w-row-add').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length < MAX_ROWS) {
      const initialWeight = mode === 'normal' ? rowValues[0].weight : 0;
      rowValues.push({ weight: initialWeight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false });
    }
    renderRows();
  });
  el.querySelector('#w-row-remove').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length > MIN_ROWS) rowValues.pop();
    renderRows();
  });

  function syncSSValuesFromSteppers() {
    ssSteppers.forEach((round, r) => {
      round.forEach((cell, e) => {
        ssRounds[r][e] = { weight: cell.weight.get(), reps: cell.reps.get() };
      });
    });
  }

  function renderSSExercises() {
    const wrap = el.querySelector('#w-ss-exercises');
    wrap.innerHTML = ssExerciseIds.map((exId, i) => `
      <div class="field"><label>種目 ${i + 1}</label>
        <select id="w-ss-ex-${i}" class="input">
          ${exercises.map((e) => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>`).join('');
    ssExerciseIds.forEach((_, i) => {
      el.querySelector(`#w-ss-ex-${i}`).addEventListener('change', (e) => {
        ssExerciseIds[i] = e.target.value;
      });
    });
    el.querySelector('#w-ss-ex-add').disabled = ssExerciseIds.length >= SS_MAX_EX;
    el.querySelector('#w-ss-ex-remove').disabled = ssExerciseIds.length <= SS_MIN_EX;
  }

  function renderSSRounds() {
    const wrap = el.querySelector('#w-ss-rounds');
    wrap.innerHTML = ssRounds.map((round, r) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">ラウンド ${r + 1}</div>
        ${ssExerciseIds.map((exId, e) => `
          <div style="margin-bottom:10px">
            <div class="muted" style="margin-bottom:4px">${escapeHtml(exerciseName(exId))}</div>
            <div class="field"><label>重量(kg)</label><div id="w-ss-weight-${r}-${e}"></div></div>
            <div class="field"><label>回数</label><div id="w-ss-reps-${r}-${e}"></div></div>
          </div>`).join('')}
      </div>`).join('');

    ssSteppers = ssRounds.map((round, r) =>
      ssExerciseIds.map((exId, e) => ({
        weight: createStepper(el.querySelector(`#w-ss-weight-${r}-${e}`), { value: round[e].weight, step: 0.5, min: 0 }),
        reps: createStepper(el.querySelector(`#w-ss-reps-${r}-${e}`), { value: round[e].reps, step: 1, min: 0 }),
      })));
    el.querySelector('#w-ss-round-add').disabled = ssRounds.length >= SS_MAX_ROUNDS;
    el.querySelector('#w-ss-round-remove').disabled = ssRounds.length <= SS_MIN_ROUNDS;
  }

  el.querySelector('#w-ss-ex-add').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssExerciseIds.length < SS_MAX_EX) {
      const nextId = exercises.find((e) => !ssExerciseIds.includes(e.id))?.id || exercises[0].id;
      ssExerciseIds.push(nextId);
      ssRounds.forEach((round) => round.push({ weight: 0, reps: 0 }));
    }
    renderSSExercises();
    renderSSRounds();
  });
  el.querySelector('#w-ss-ex-remove').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssExerciseIds.length > SS_MIN_EX) {
      ssExerciseIds.pop();
      ssRounds.forEach((round) => round.pop());
    }
    renderSSExercises();
    renderSSRounds();
  });
  el.querySelector('#w-ss-round-add').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssRounds.length < SS_MAX_ROUNDS) ssRounds.push(ssExerciseIds.map(() => ({ weight: 0, reps: 0 })));
    renderSSRounds();
  });
  el.querySelector('#w-ss-round-remove').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssRounds.length > SS_MIN_ROUNDS) ssRounds.pop();
    renderSSRounds();
  });

  function applyMode(newMode) {
    syncRowValuesFromSteppers();
    if (mode === 'superset') syncSSValuesFromSteppers();
    mode = newMode;
    el.querySelector('#w-normal-block').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-ss-block').style.display = mode === 'superset' ? 'block' : 'none';
    el.querySelector('#w-error').textContent = '';
    renderRows();
    if (mode === 'superset') {
      renderSSExercises();
      renderSSRounds();
    }
    if (onModeChange) onModeChange(mode);
  }
  el.querySelector('#w-mode-seg').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelector('#w-mode-seg').querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      applyMode(b.dataset.m);
    }));

  return {
    mode: () => mode,
    rows: () => rowValues,
    resetRows: (keepWeights) => {
      rowValues = keepWeights
        ? rowValues.map((rv) => ({ weight: rv.weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }))
        : defaultRowValues(DEFAULT_ROWS);
      renderRows();
    },
    ssExerciseIds: () => ssExerciseIds,
    ssRounds: () => ssRounds,
    resetSuperset: () => {
      ssExerciseIds = defaultSSExerciseIds();
      ssRounds = defaultSSRounds(ssExerciseIds);
      renderSSExercises();
      renderSSRounds();
    },
    syncFromSteppers: () => {
      syncRowValuesFromSteppers();
      if (mode === 'superset') syncSSValuesFromSteppers();
    },
    applyMode,
  };
}
