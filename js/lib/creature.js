// キャラクター育成の計算（すべて純粋関数）。
// 強さ・段階・気分は保存せず、履歴（workouts / sets）・開始週・お休み週から毎回計算する。
import { estimate1RM } from './calc.js';
import { localDateStr } from './localdate.js';

// ---- 調整用の定数（ルールを変えるときはここだけ直す） ----
export const WEEKLY_GOAL = 2;       // 週の目標回数
export const SESSION_MIN = 30;      // 達成とみなす所要時間（分）
export const LEAD_IN_MIN = 5;       // 自動推定に足す分（最初の種目をやっている間は記録が出ないため）
export const START_POWER = 10;      // 開始時の強さ（ベビー）
export const GAIN_FULL = 10;        // 目標回数を達成した週の増加
export const LOSS_ONE = 5;          // 1回だけの週の減少
export const LOSS_ZERO = 15;        // 0回の週の減少
export const BONUS_PER_EVENT = 2;   // 自己ベスト更新1種目あたりの加点
export const MAX_EVENTS = 3;        // 1週に加点する更新種目数の上限
export const BW_TOLERANCE = 3;      // 自重種目で「同じ重量以上」を判定するときの許容（kg）

export const STAGE_NAMES = ['たまご', 'ベビー', 'こども', 'ヤング', 'マッスル', 'レジェンド'];
const STAGE_FLOORS = [0, 10, 30, 50, 70, 90];

const num = (v) => Number(v) || 0;

function parseDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) throw new Error(`invalid date: ${dateStr}`);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

// 月曜=0 … 日曜=6
function weekdayIndex(dateStr) {
  return (parseDate(dateStr).getDay() + 6) % 7;
}

// その日を含む週の月曜
export function weekStart(dateStr) {
  return addDays(dateStr, -weekdayIndex(dateStr));
}

// 今日を含む、その週の残り日数（月曜は7、日曜は1）
export function daysLeftInWeek(dateStr) {
  return 7 - weekdayIndex(dateStr);
}

export function stageFor(power) {
  let stage = 0;
  for (let i = 0; i < STAGE_FLOORS.length; i++) {
    if (power >= STAGE_FLOORS[i]) stage = i;
  }
  return stage;
}

// 次の進化までの残り（最高段階では null）
export function nextEvolutionIn(power) {
  const stage = stageFor(power);
  return stage >= STAGE_FLOORS.length - 1 ? null : STAGE_FLOORS[stage + 1] - power;
}

// 1日分のセット（createdAt を持つ）とその日の workout 群から所要時間（分）を返す。
// 手入力の所要時間があれば最大値を優先し、なければ最初と最後のセット保存の間隔 + LEAD_IN_MIN
export function sessionMinutes(sets, workouts) {
  const manual = Math.max(0, ...workouts.map((w) => num(w.durationSec)));
  if (manual > 0) return manual / 60;
  if (!sets.length) return 0;
  const times = sets.map((s) => num(s.createdAt));
  return (Math.max(...times) - Math.min(...times)) / 60000 + LEAD_IN_MIN;
}

// セットのある日ごとの所要時間と、達成したか。日付昇順
export function buildSessions(workouts, sets) {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const byDate = new Map();
  for (const w of workouts) {
    if (!byDate.has(w.date)) byDate.set(w.date, { sets: [], workouts: [] });
    byDate.get(w.date).workouts.push(w);
  }
  for (const s of sets) {
    const date = dateOf.get(s.workoutId);
    if (date !== undefined) byDate.get(date).sets.push(s);
  }
  const out = [];
  for (const [date, g] of byDate) {
    if (!g.sets.length) continue;
    const minutes = sessionMinutes(g.sets, g.workouts);
    out.push({ date, minutes, qualifies: minutes >= SESSION_MIN });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ある週（weekStartStr から7日間）に自己ベストを更新した種目のID。
// datedSets は date を持つ全セット。その週より前に記録がない種目は対象外
export function progressExerciseIds(datedSets, exercises, weekStartStr) {
  const weekEnd = addDays(weekStartStr, 6);
  const bodyweightIds = new Set(exercises.filter((e) => e.bodyweight).map((e) => e.id));
  const netReps = (s) => num(s.reps) - num(s.assistedReps);
  const oneRM = (s) => estimate1RM(num(s.weight), netReps(s));

  const byExercise = new Map();
  for (const s of datedSets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, { prior: [], week: [] });
    const g = byExercise.get(s.exerciseId);
    if (s.date < weekStartStr) g.prior.push(s);
    else if (s.date <= weekEnd) g.week.push(s);
  }

  const out = [];
  for (const [id, g] of byExercise) {
    if (!g.prior.length || !g.week.length) continue;
    const isBodyweight = bodyweightIds.has(id);
    const tol = isBodyweight ? BW_TOLERANCE : 0;
    const priorBest = Math.max(...g.prior.map(oneRM));
    const priorMaxWeight = Math.max(...g.prior.map((p) => num(p.weight)));
    // (a) 推定1RMの更新。自重種目は、ウェイトを足したときだけ有効（体重の増減を成長と誤判定しない）
    const improved1RM = g.week.some((s) =>
      oneRM(s) > priorBest && (!isBodyweight || num(s.weight) > priorMaxWeight + tol));
    // (b) 同じ重量以上での最大回数の更新
    const improvedReps = g.week.some((s) => {
      const comparable = g.prior.filter((p) => num(p.weight) >= num(s.weight) - tol);
      return comparable.length > 0 && netReps(s) > Math.max(...comparable.map(netReps));
    });
    if (improved1RM || improvedReps) out.push(id);
  }
  return out;
}

// 今週が目標達成済みなら元気。そうでなければ、直近の終了した非お休み週の結果で決める
function moodFor(weeks) {
  const current = weeks[weeks.length - 1];
  if (current.qualified >= WEEKLY_GOAL) return 'genki';
  for (let i = weeks.length - 2; i >= 0; i--) {
    const w = weeks[i];
    if (w.rest) continue;
    if (w.qualified >= WEEKLY_GOAL) return 'genki';
    return w.qualified === 1 ? 'normal' : 'shobori';
  }
  return 'normal';
}

// 履歴から、強さ・段階・気分と、週ごとの結果を計算する。
// workouts / sets / exercises は全件、startWeek と restWeeks は月曜の 'YYYY-MM-DD'、today は 'YYYY-MM-DD'
export function computeCreature({ workouts, sets, exercises, startWeek, restWeeks = [], today }) {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const datedSets = sets
    .filter((s) => dateOf.has(s.workoutId))
    .map((s) => ({ ...s, date: dateOf.get(s.workoutId) }));
  const sessionsAll = buildSessions(workouts, sets);
  const rest = new Set(restWeeks);
  const currentWeek = weekStart(today);
  const start = weekStart(startWeek);
  const first = start <= currentWeek ? start : currentWeek;

  const weeks = [];
  let power = START_POWER;
  for (let ws = first; ws <= currentWeek; ws = addDays(ws, 7)) {
    const weekEnd = addDays(ws, 6);
    const sessions = sessionsAll.filter((s) => s.date >= ws && s.date <= weekEnd);
    const qualified = sessions.filter((s) => s.qualifies).length;
    const closed = ws < currentWeek;
    const isRest = rest.has(ws);
    const events = progressExerciseIds(datedSets, exercises, ws);

    let delta = 0;
    if (closed && !isRest) {
      const bonus = Math.min(events.length, MAX_EVENTS) * BONUS_PER_EVENT;
      if (qualified >= WEEKLY_GOAL) delta = GAIN_FULL + bonus;
      else if (qualified === 1) delta = -LOSS_ONE + bonus;
      else delta = -LOSS_ZERO;
    }
    if (closed) power = Math.max(0, Math.min(100, power + delta));
    weeks.push({ weekStart: ws, rest: isRest, closed, sessions, qualified, events, delta });
  }

  return { power, stage: stageFor(power), mood: moodFor(weeks), weeks, current: weeks[weeks.length - 1] };
}
