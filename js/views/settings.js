import { exportAll, importAll, getAll, put, remove, uid, get } from '../db.js';

export async function renderSettings(el) {
  const key = localStorage.getItem('gemini_api_key') || '';
  const goal = (await get('goals', 'main')) || { id: 'main', competitionDate: '', targetWeight: '' };
  const patterns = await getAll('setPatterns');

  el.innerHTML = `
    <h2 class="view-title">設定</h2>

    <div class="card">
      <strong>Gemini APIキー</strong>
      <p class="muted">AI分析に使用。キーはこの端末内のみに保存されます。</p>
      <input id="s-key" type="password" class="input" value="${key}" placeholder="AIza..." />
      <button id="s-key-save" class="btn btn-primary btn-block" style="margin-top:10px">キーを保存</button>
    </div>

    <div class="card">
      <strong>大会・目標</strong>
      <div class="field" style="margin-top:8px"><label>大会日</label>
        <input id="s-comp" type="date" class="input" value="${goal.competitionDate || ''}" /></div>
      <div class="field"><label>目標体重(kg)</label>
        <input id="s-target" type="number" class="input" value="${goal.targetWeight || ''}" /></div>
      <button id="s-goal-save" class="btn btn-primary btn-block">目標を保存</button>
    </div>

    <div class="card">
      <strong>セットパターン管理</strong>
      <div class="row" style="margin-top:8px">
        <input id="s-pat" class="input" placeholder="新しいパターン名" />
        <button id="s-pat-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="s-pat-list"></div>
    </div>

    <div class="card">
      <strong>データのバックアップ</strong>
      <p class="muted">全データをJSONで書き出し・読み込みします。</p>
      <button id="s-export" class="btn btn-primary btn-block" style="margin-bottom:10px">エクスポート</button>
      <input id="s-file" type="file" accept="application/json" style="display:none" />
      <button id="s-import" class="btn btn-block">インポート</button>
      <div id="s-msg" class="muted" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#s-key-save').addEventListener('click', () => {
    localStorage.setItem('gemini_api_key', el.querySelector('#s-key').value.trim());
    el.querySelector('#s-msg').textContent = 'APIキーを保存しました。';
  });

  el.querySelector('#s-goal-save').addEventListener('click', async () => {
    await put('goals', { id: 'main',
      competitionDate: el.querySelector('#s-comp').value,
      targetWeight: parseFloat(el.querySelector('#s-target').value) || '' });
    el.querySelector('#s-msg').textContent = '目標を保存しました。';
  });

  function renderPatterns(list) {
    el.querySelector('#s-pat-list').innerHTML = list.map((p) => `
      <div class="list-item">
        <span class="pat-name" data-id="${p.id}">${p.name}</span>
        <span>
          <button class="btn btn-edit" data-edit="${p.id}" style="min-height:40px;padding:0 12px">編集</button>
          <button class="btn btn-danger" data-del="${p.id}" style="min-height:40px;padding:0 12px">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">パターンがありません。</p>';
    el.querySelectorAll('#s-pat-list [data-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('setPatterns', b.dataset.del); renderPatterns(await getAll('setPatterns')); }));
    el.querySelectorAll('#s-pat-list [data-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('setPatterns')).find((x) => x.id === b.dataset.edit);
        const name = prompt('パターン名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('setPatterns', p); renderPatterns(await getAll('setPatterns')); }
      }));
  }

  el.querySelector('#s-pat-add').addEventListener('click', async () => {
    const name = el.querySelector('#s-pat').value.trim();
    if (!name) return;
    await put('setPatterns', { id: uid(), name });
    el.querySelector('#s-pat').value = '';
    renderPatterns(await getAll('setPatterns'));
  });

  renderPatterns(patterns);

  el.querySelector('#s-export').addEventListener('click', async () => {
    const obj = await exportAll();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gachi-fit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    el.querySelector('#s-msg').textContent = 'エクスポートしました。';
  });

  const fileInput = el.querySelector('#s-file');
  el.querySelector('#s-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msg = el.querySelector('#s-msg');
    try {
      const obj = JSON.parse(await file.text());
      await importAll(obj);
      msg.textContent = 'インポートが完了しました。';
    } catch (e) { msg.textContent = 'インポート失敗: ' + e.message; }
    fileInput.value = '';
  });
}
