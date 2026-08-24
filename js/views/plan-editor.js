import { getAll } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { localDateStr } from '../lib/localdate.js';
import { savePlan, deletePlan } from '../lib/crew.js';

export async function openPlanEditor(plan, user, onDone) {
  const places = await getAll('places');
  const isNew = !plan;
  const cur = plan || { date: localDateStr(), startTime: '', placeName: '', note: '' };

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:var(--z-modal);background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">${isNew ? '予定を追加' : '予定を編集'}</h2>
    <div class="field"><label>日付</label>
      <input id="p-date" type="date" class="input" value="${escapeHtml(cur.date)}" /></div>
    <div class="field"><label>時刻</label>
      <input id="p-time" type="time" class="input" value="${escapeHtml(cur.startTime)}" /></div>
    ${places.length ? `<div class="field"><label>登録済みジムから選ぶ</label>
      <select id="p-place-sel" class="input">
        <option value="">選択してください</option>
        ${places.map((pl) => `<option value="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</option>`).join('')}
      </select></div>` : ''}
    <div class="field"><label>ジム名</label>
      <input id="p-place" class="input" placeholder="例: ゴールドジム渋谷" value="${escapeHtml(cur.placeName)}" /></div>
    <div class="field"><label>メモ（任意）</label>
      <input id="p-note" class="input" placeholder="例: 脚の日、補助してくれる人歓迎" value="${escapeHtml(cur.note || '')}" /></div>
    <div id="p-error" class="error"></div>
    <button id="p-save" class="btn btn-primary btn-block mt-2">保存</button>
    ${isNew ? '' : '<button id="p-delete" class="btn btn-danger btn-block mt-2">削除</button>'}
    <button id="p-cancel" class="btn btn-block mt-2">キャンセル</button>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();

  const sel = modal.querySelector('#p-place-sel');
  if (sel) {
    sel.addEventListener('change', () => {
      if (sel.value) modal.querySelector('#p-place').value = sel.value;
    });
  }

  modal.querySelector('#p-cancel').addEventListener('click', close);

  modal.querySelector('#p-save').addEventListener('click', async () => {
    const err = modal.querySelector('#p-error');
    const date = modal.querySelector('#p-date').value;
    const startTime = modal.querySelector('#p-time').value;
    const placeName = modal.querySelector('#p-place').value.trim();
    if (!date || !startTime || !placeName) {
      err.textContent = '日付・時刻・ジム名を入力してください'; return;
    }
    err.textContent = '';
    try {
      await savePlan({
        id: plan ? plan.id : undefined,
        ownerEmail: user.email,
        ownerName: user.displayName,
        date, startTime, placeName,
        note: modal.querySelector('#p-note').value.trim(),
      });
      close();
      onDone();
    } catch (e) {
      err.textContent = '保存できませんでした: ' + e.message;
    }
  });

  const delBtn = modal.querySelector('#p-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const err = modal.querySelector('#p-error');
      try {
        await deletePlan(plan.id);
        close();
        onDone();
      } catch (e) {
        err.textContent = '削除できませんでした: ' + e.message;
      }
    });
  }
}
