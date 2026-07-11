import { get, getAll, put, uid } from '../db.js';
import { estimate1RM } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';

// セット編集モーダルを開く。保存/キャンセルで閉じ、変更時に onDone() を呼ぶ。
export async function openSetEditor(setId, onDone) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { note: '' };

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="field"><label>重量(kg)</label><div id="e-weight"></div></div>
    <div class="field"><label>回数</label><div id="e-reps"></div></div>
    <div class="field">
      <button type="button" id="e-assist-toggle" class="btn btn-block">補助あり：OFF</button>
      <div id="e-assist-wrap" style="display:none;margin-top:8px"><label>補助回数</label><div id="e-assist"></div></div>
    </div>
    <div class="field"><label>メモ</label><input id="e-note" class="input" value="${escapeHtml(log.note || '')}" /></div>
    <div id="e-error" class="error"></div>
    <button id="e-save" class="btn btn-primary btn-block">保存</button>
    <button id="e-cancel" class="btn btn-block" style="margin-top:8px">キャンセル</button>`;
  document.body.appendChild(modal);

  const weightStepper = createStepper(modal.querySelector('#e-weight'), { value: set.weight, step: 0.5, min: 0 });
  const repsStepper = createStepper(modal.querySelector('#e-reps'), { value: set.reps, step: 1, min: 0 });
  const assistStepper = createStepper(modal.querySelector('#e-assist'), { value: set.assistedReps || 0, step: 1, min: 0 });
  let assistOn = !!(set.assistedReps && set.assistedReps > 0);
  function syncAssist() {
    modal.querySelector('#e-assist-toggle').textContent = '補助あり：' + (assistOn ? 'ON' : 'OFF');
    modal.querySelector('#e-assist-wrap').style.display = assistOn ? 'block' : 'none';
  }
  syncAssist();
  modal.querySelector('#e-assist-toggle').addEventListener('click', () => {
    assistOn = !assistOn;
    if (!assistOn) assistStepper.set(0);
    syncAssist();
  });

  modal.querySelector('#e-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#e-save').addEventListener('click', async () => {
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    const assistedReps = assistOn ? assistStepper.get() : 0;
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
    set.weight = weight; set.reps = reps; set.assistedReps = assistedReps;
    set.estimated1RM = estimate1RM(weight, reps - assistedReps);
    await put('sets', set);
    const newLog = { id: log.id || uid(), setId, note: modal.querySelector('#e-note').value };
    await put('sensoryLogs', newLog);
    modal.remove();
    onDone && onDone();
  });
}
