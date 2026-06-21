import { getAll, put, remove, uid } from '../db.js';

export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  let patterns = (await getAll('setPatterns')).map((p) => p.name);
  if (patterns.length === 0) patterns = ['通常'];
  el.innerHTML = `
    <h2 class="view-title">メニュー管理</h2>
    <div class="card">
      <div class="field"><label>種目名</label>
        <input id="ex-name" class="input" placeholder="例: ベンチプレス" /></div>
      <div class="field"><label>部位（細分化可）</label>
        <input id="ex-part" class="input" placeholder="例: 胸 / 上部" /></div>
      <div class="field"><label>意識ポイント（カンマ区切り）</label>
        <input id="ex-cues" class="input" placeholder="例: 肩甲骨下制, 腹圧" /></div>
      <div class="field"><label>セットパターン</label>
        <div class="seg" id="ex-pattern">
          ${patterns.map((p, i) => `<button data-p="${p}" class="${i === 0 ? 'sel' : ''}">${p}</button>`).join('')}
        </div></div>
      <div id="ex-error" class="error"></div>
      <button id="ex-save" class="btn btn-primary btn-block">種目を追加</button>
    </div>
    <div id="ex-list"></div>
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row" style="margin-top:8px">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>`;

  let pattern = patterns[0];
  el.querySelectorAll('#ex-pattern button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('#ex-pattern button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      pattern = b.dataset.p;
    }));

  el.querySelector('#ex-save').addEventListener('click', async () => {
    const name = el.querySelector('#ex-name').value.trim();
    const bodyPart = el.querySelector('#ex-part').value.trim();
    const cuePresets = el.querySelector('#ex-cues').value
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!name) { el.querySelector('#ex-error').textContent = '種目名を入力してください'; return; }
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern });
    renderExercises(el);
  });

  renderList(el, exercises);

  async function renderPlaces() {
    const places = await getAll('places');
    el.querySelector('#pl-list').innerHTML = places.map((p) => `
      <div class="list-item">
        <span>${escapeHtml(p.name)}</span>
        <span>
          <button class="btn btn-edit" data-pl-edit="${p.id}" style="min-height:40px;padding:0 12px">編集</button>
          <button class="btn btn-danger" data-pl-del="${p.id}" style="min-height:40px;padding:0 12px">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">場所がありません。</p>';
    el.querySelectorAll('[data-pl-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('places', b.dataset.plDel); renderPlaces(); }));
    el.querySelectorAll('[data-pl-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('places')).find((x) => x.id === b.dataset.plEdit);
        const name = prompt('場所名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('places', p); renderPlaces(); }
      }));
  }
  el.querySelector('#pl-add').addEventListener('click', async () => {
    const name = el.querySelector('#pl-name').value.trim();
    if (!name) return;
    await put('places', { id: uid(), name });
    el.querySelector('#pl-name').value = '';
    renderPlaces();
  });
  renderPlaces();
}

function renderList(el, exercises) {
  const list = el.querySelector('#ex-list');
  if (!exercises.length) {
    list.innerHTML = '<p class="muted">まだ種目がありません。</p>';
    return;
  }
  list.innerHTML = exercises.map((e) => `
    <div class="card">
      <div class="list-item" style="border:none;padding:0">
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          <span class="muted"> ${escapeHtml(e.bodyPart || '')}</span>
          <div>${(e.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>
          <span class="chip">${escapeHtml(e.setPattern || '通常')}</span>
        </div>
        <button class="btn btn-danger" data-del="${e.id}">削除</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await remove('exercises', b.dataset.del);
      renderExercises(el);
    }));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
