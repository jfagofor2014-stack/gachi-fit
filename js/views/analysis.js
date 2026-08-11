import { renderHistory } from './history.js';
import { renderInsights } from './insights.js';
import { renderBody } from './body.js';

const SECTIONS = [
  { key: 'history', label: '履歴 / PR', render: renderHistory },
  { key: 'insights', label: 'インサイト', render: renderInsights },
  { key: 'body', label: 'ボディ', render: renderBody },
];

export async function renderAnalysis(el, navigate, opts = {}) {
  const initial = SECTIONS.some((s) => s.key === opts.section) ? opts.section : SECTIONS[0].key;
  el.innerHTML = `
    <h2 class="view-title">分析</h2>
    <div class="subseg" id="an-seg">
      ${SECTIONS.map((s) => `<button data-k="${s.key}" class="${s.key === initial ? 'sel' : ''}">${s.label}</button>`).join('')}
    </div>
    <div id="an-body"></div>`;

  const body = el.querySelector('#an-body');
  const show = async (key) => {
    const sec = SECTIONS.find((s) => s.key === key);
    await sec.render(body, navigate);
  };
  el.querySelectorAll('#an-seg button').forEach((b) =>
    b.addEventListener('click', async () => {
      el.querySelectorAll('#an-seg button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      await show(b.dataset.k);
    }));
  await show(initial);
}
