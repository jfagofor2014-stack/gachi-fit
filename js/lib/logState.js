// その日の記録の状態（コース、スーパーセットの組、ドロップの連なり）。
// タブ移動や再読み込みでも同じ groupId を使い続けるため sessionStorage に日付付きで持つ
const KEY = 'gachi_log_state';

function defaultSession() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

const fresh = (date) => ({ date, courseIds: [], courseName: '', superset: null, drop: null });

// 別の日の状態・壊れた値・読めないときは、その日の空の状態
export function loadLogState(today, storage = defaultSession()) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return fresh(today);
    const s = JSON.parse(raw);
    if (!s || s.date !== today) return fresh(today);
    return {
      date: today,
      courseIds: Array.isArray(s.courseIds) ? s.courseIds : [],
      courseName: typeof s.courseName === 'string' ? s.courseName : '',
      superset: s.superset || null,
      drop: s.drop || null,
    };
  } catch {
    return fresh(today);
  }
}

export function saveLogState(state, storage = defaultSession()) {
  try {
    if (storage) storage.setItem(KEY, JSON.stringify(state));
  } catch { /* 保存できなくても記録は続ける */ }
}
