import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderExercises } from './views/exercises.js';
import { renderHistory } from './views/history.js';

const routes = {
  home: renderHome,
  workout: renderWorkout,
  exercises: renderExercises,
  history: renderHistory,
};

async function navigate(route) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route));
  const render = routes[route] || renderHome;
  await render(el);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

navigate('home');
