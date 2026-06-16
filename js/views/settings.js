import { exportAll, importAll } from '../db.js';

export async function renderSettings(el) {
  el.innerHTML = `
    <h2 class="view-title">設定</h2>
    <div class="card">
      <strong>データのバックアップ</strong>
      <p class="muted">全データをJSONで書き出し・読み込みします。</p>
      <button id="s-export" class="btn btn-primary btn-block" style="margin-bottom:10px">エクスポート</button>
      <input id="s-file" type="file" accept="application/json" style="display:none" />
      <button id="s-import" class="btn btn-block">インポート</button>
      <div id="s-msg" class="muted" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#s-export').addEventListener('click', async () => {
    const obj = await exportAll();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gachi-fit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    } catch (e) {
      msg.textContent = 'インポート失敗: ' + e.message;
    }
    fileInput.value = '';
  });
}
