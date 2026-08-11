import { getAll, put, remove, uid } from '../db.js';
import { escapeHtml } from '../lib/html.js';

export async function renderPlaces(el) {
  el.innerHTML = `
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row mt-2">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>`;

  async function renderList() {
    const places = await getAll('places');
    el.querySelector('#pl-list').innerHTML = places.map((p) => `
      <div class="list-item">
        <span>${escapeHtml(p.name)}</span>
        <span>
          <button class="btn btn-edit btn-sm" data-pl-edit="${p.id}">編集</button>
          <button class="btn btn-danger btn-sm" data-pl-del="${p.id}">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">場所がありません。</p>';
    el.querySelectorAll('[data-pl-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('places', b.dataset.plDel); renderList(); }));
    el.querySelectorAll('[data-pl-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('places')).find((x) => x.id === b.dataset.plEdit);
        const name = prompt('場所名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('places', p); renderList(); }
      }));
  }

  el.querySelector('#pl-add').addEventListener('click', async () => {
    const name = el.querySelector('#pl-name').value.trim();
    if (!name) return;
    await put('places', { id: uid(), name });
    el.querySelector('#pl-name').value = '';
    renderList();
  });
  renderList();
}
