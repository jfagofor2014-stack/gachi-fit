import { getAll, get, put, remove, uid } from '../db.js';
import { compressImage } from '../lib/image.js';
import { sparklinePath } from '../lib/chart.js';
import { escapeHtml } from './exercises.js';
import { localDateStr } from '../lib/localdate.js';

export async function renderBody(el) {
  const goal = (await get('goals', 'main')) || { targetWeight: '' };
  const weights = (await getAll('bodyWeights')).sort((a, b) => (a.date < b.date ? -1 : 1));
  const photos = (await getAll('photos')).sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = weights.length ? weights[weights.length - 1].weight : null;
  const diff = (latest != null && goal.targetWeight) ? (latest - goal.targetWeight) : null;
  const series = weights.map((w) => w.weight);
  const wPath = sparklinePath(series, 300, 44);

  el.innerHTML = `
    <h2 class="view-title">ボディ</h2>

    <div class="card">
      <strong>体重</strong>
      <div class="row" style="margin-top:8px">
        <input id="b-weight" class="input" type="number" inputmode="decimal" placeholder="kg" />
        <button id="b-weight-add" class="btn btn-primary" style="flex:0 0 auto">記録</button>
      </div>
      <div class="muted" style="margin-top:8px">
        現在: ${latest != null ? latest + 'kg' : '-'}
        ${diff != null ? ` / 目標まで ${diff > 0 ? diff.toFixed(1) + 'kg減' : Math.abs(diff).toFixed(1) + 'kg増'}` : ''}
      </div>
      ${wPath ? `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="${wPath}" /></svg>` : ''}
    </div>

    <div class="card">
      <strong>体形写真</strong>
      <div class="field" style="margin-top:8px"><label>部位</label>
        <input id="b-part" class="input" placeholder="例: 背中" /></div>
      <input id="b-file" type="file" accept="image/*" capture="environment" style="display:none" />
      <button id="b-shoot" class="btn btn-primary btn-block">写真を追加</button>
      <div id="b-msg" class="muted" style="margin-top:8px"></div>
      <div id="b-compare" class="muted" style="margin-top:8px">比較したい写真を2枚タップ</div>
      <div id="b-compare-view"></div>
      <div id="b-photos" class="photo-grid" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#b-weight-add').addEventListener('click', async () => {
    const w = parseFloat(el.querySelector('#b-weight').value);
    if (!(w > 0)) { el.querySelector('#b-msg').textContent = '体重を正しく入力してください'; return; }
    await put('bodyWeights', { id: uid(), date: localDateStr(), weight: w });
    renderBody(el);
  });

  const fileInput = el.querySelector('#b-file');
  el.querySelector('#b-shoot').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msg = el.querySelector('#b-msg');
    try {
      const dataUrl = await compressImage(file);
      await put('photos', { id: uid(), date: localDateStr(),
        bodyPart: el.querySelector('#b-part').value.trim(), dataUrl, note: '' });
      msg.textContent = '写真を保存しました。';
      renderBody(el);
    } catch (e) { msg.textContent = '保存失敗: ' + e.message; }
    fileInput.value = '';
  });

  const selected = [];
  const grid = el.querySelector('#b-photos');
  grid.innerHTML = photos.map((p) => `
    <div class="photo-thumb" data-id="${p.id}">
      <img src="${p.dataUrl}" alt="${escapeHtml(p.bodyPart || '')}" />
      <div class="muted" style="font-size:12px">${p.date} ${escapeHtml(p.bodyPart || '')}</div>
      <button class="btn btn-danger" data-del="${p.id}" style="min-height:36px;padding:0 10px;margin-top:4px">削除</button>
    </div>`).join('') || '<p class="muted">まだ写真がありません。</p>';

  grid.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async (ev) => { ev.stopPropagation(); await remove('photos', b.dataset.del); renderBody(el); }));

  grid.querySelectorAll('.photo-thumb').forEach((thumb) =>
    thumb.querySelector('img').addEventListener('click', () => {
      const id = thumb.dataset.id;
      const idx = selected.indexOf(id);
      if (idx >= 0) { selected.splice(idx, 1); thumb.classList.remove('sel'); }
      else { selected.push(id); thumb.classList.add('sel'); if (selected.length > 2) {
        const removeId = selected.shift();
        grid.querySelector(`.photo-thumb[data-id="${removeId}"]`)?.classList.remove('sel');
      } }
      const cmp = el.querySelector('#b-compare-view');
      if (selected.length === 2) {
        const a = photos.find((p) => p.id === selected[0]);
        const b = photos.find((p) => p.id === selected[1]);
        cmp.innerHTML = `<div class="photo-grid" style="margin-top:8px">
          <div><img src="${a.dataUrl}" /><div class="muted" style="font-size:12px">${a.date}</div></div>
          <div><img src="${b.dataUrl}" /><div class="muted" style="font-size:12px">${b.date}</div></div>
        </div>`;
      } else { cmp.innerHTML = ''; }
    }));
}
