const ITEMS = [
  { route: 'exercises', label: 'メニュー管理', desc: '種目・部位・セットパターン' },
  { route: 'history', label: '履歴 / PR', desc: '推移グラフ' },
  { route: 'review', label: '振り返り', desc: 'セット編集・削除' },
  { route: 'settings', label: '設定', desc: 'APIキー・目標・バックアップ' },
];

export async function renderMore(el, navigate) {
  el.innerHTML = `<h2 class="view-title">その他</h2>` +
    ITEMS.map((it) => `<div class="card more-item" data-route="${it.route}">
      <strong>${it.label}</strong>
      <div class="muted">${it.desc}</div>
    </div>`).join('');
  el.querySelectorAll('.more-item').forEach((c) =>
    c.addEventListener('click', () => navigate(c.dataset.route)));
}
