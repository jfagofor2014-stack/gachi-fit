import { renderExercises } from './exercises.js';
import { renderCourses } from './courses.js';
import { renderPlaces } from './places.js';
import { renderSettings } from './settings.js';

const SECTIONS = [
  { key: 'exercises', label: '種目', render: renderExercises },
  { key: 'courses', label: 'コース', render: renderCourses },
  { key: 'places', label: '場所', render: renderPlaces },
  { key: 'settings', label: '設定', render: renderSettings },
];

export async function renderManage(el, navigate, opts = {}) {
  const initial = SECTIONS.some((s) => s.key === opts.section) ? opts.section : SECTIONS[0].key;
  el.innerHTML = `
    <h2 class="view-title">管理</h2>
    <div class="subseg" id="mg-seg">
      ${SECTIONS.map((s) => `<button data-k="${s.key}" class="${s.key === initial ? 'sel' : ''}">${s.label}</button>`).join('')}
    </div>
    <div id="mg-body"></div>`;

  const body = el.querySelector('#mg-body');
  const show = async (key) => {
    const sec = SECTIONS.find((s) => s.key === key);
    await sec.render(body, navigate);
  };
  el.querySelectorAll('#mg-seg button').forEach((b) =>
    b.addEventListener('click', async () => {
      el.querySelectorAll('#mg-seg button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      await show(b.dataset.k);
    }));
  await show(initial);
}
