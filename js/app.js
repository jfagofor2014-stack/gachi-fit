import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderAnalysis } from './views/analysis.js';
import { renderManage } from './views/manage.js';
import { getAll, put, uid } from './db.js';
import { ensureDefaultSetPatterns } from './lib/seed.js';
import { stopVoiceInput } from './lib/voice.js';

const TAB_ROUTES = ['home', 'workout', 'analysis', 'manage'];

const routes = {
  home: renderHome,
  workout: renderWorkout,
  analysis: renderAnalysis,
  manage: renderManage,
};

async function navigate(route, opts) {
  const el = document.getElementById('view');
  stopVoiceInput();
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  document.body.classList.toggle('has-interval-bar', route === 'workout');
  const render = routes[route] || renderHome;
  await render(el, navigate, opts);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

ensureDefaultSetPatterns(() => getAll('setPatterns'), (v) => put('setPatterns', v), uid)
  .finally(() => navigate('home'));
