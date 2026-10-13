import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderAnalysis } from './views/analysis.js';
import { renderManage } from './views/manage.js';
import { getAll, put, uid } from './db.js';
import { ensureDefaultSetPatterns } from './lib/seed.js';
import { stopVoiceInput } from './lib/voice.js';
import { ensureExerciseMeta } from './lib/exerciseMeta.js';
import { DEFAULT_EXERCISE_PRESETS } from './lib/exercisePresets.js';
import { getEnv, setEnv } from './lib/env.js';

const TAB_ROUTES = ['home', 'workout', 'analysis', 'manage'];

const routes = {
  home: renderHome,
  workout: renderWorkout,
  analysis: renderAnalysis,
  manage: renderManage,
};

// 環境を切り替えたときに現在の画面を描き直すため、直近の route を覚えておく
let currentRoute = 'home';

async function navigate(route, opts) {
  currentRoute = route;
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

// ヘッダーの環境切替（自宅／ジム）
function renderEnvSwitch() {
  const env = getEnv();
  document.querySelectorAll('#env-seg button').forEach((b) => {
    const on = b.dataset.env === env;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
document.querySelectorAll('#env-seg button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.env === getEnv()) return;
    setEnv(b.dataset.env);
    renderEnvSwitch();
    navigate(currentRoute);
  }));
renderEnvSwitch();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// どちらかが失敗しても画面は開く
ensureDefaultSetPatterns(() => getAll('setPatterns'), (v) => put('setPatterns', v), uid)
  .catch(() => {})
  .then(() => ensureExerciseMeta(() => getAll('exercises'), (v) => put('exercises', v), DEFAULT_EXERCISE_PRESETS))
  .catch(() => {})
  .finally(() => navigate('home'));
