// 1セットずつ記録するための計算（すべて純粋関数）。
// セットの並び（ドロップの連なりは1スロット）、今のセットの初期値、前回の値、ドロップの下げ幅を扱う。
import { addDays } from './creature.js';

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

// 1種目・1日分のセットを時刻順に並べ、ドロップの連なりを1スロットにまとめる
export function toSlots(sets) {
  const sorted = [...sets].sort((a, b) => num(a.createdAt) - num(b.createdAt));
  const slots = [];
  for (const s of sorted) {
    const last = slots[slots.length - 1];
    if (s.groupType === 'dropset' && s.groupId && last && last.groupId === s.groupId) {
      last.drops.push({ weight: num(s.weight), reps: num(s.reps) });
      last.setIds.push(s.id);
      continue;
    }
    slots.push({
      weight: num(s.weight), reps: num(s.reps), assistedReps: num(s.assistedReps),
      drops: [], setIds: [s.id],
      groupId: s.groupType === 'dropset' ? s.groupId : undefined,
    });
  }
  return slots.map(({ groupId, ...rest }) => rest);
}

// today より前で、その種目のセットがある直近の日のセット
function lastDaySets(sets, workouts, exerciseId, today, predicate = () => true) {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const byDate = new Map();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const date = dateOf.get(s.workoutId);
    if (date === undefined || !(date < today)) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(s);
  }
  const dates = [...byDate.keys()].filter((d) => predicate(byDate.get(d))).sort();
  return dates.length ? byDate.get(dates[dates.length - 1]) : [];
}

export function lastSessionSlots(sets, workouts, exerciseId, today) {
  return toSlots(lastDaySets(sets, workouts, exerciseId, today));
}

// 今のセットに最初に入れる値: 今日の最後のスロット → 前回の1セット目 → 空（自重種目は体重）
export function initialSetValues({ todaySlots, lastSlots, bodyWeight, isBodyweight }) {
  const pick = todaySlots.length ? todaySlots[todaySlots.length - 1] : lastSlots[0];
  if (pick) return { weight: pick.weight, reps: pick.reps };
  return { weight: isBodyweight && bodyWeight > 0 ? bodyWeight : 0, reps: 0 };
}

export function previousForSet(lastSlots, setNumber) {
  const slot = lastSlots[setNumber - 1];
  return slot ? { weight: slot.weight, reps: slot.reps } : null;
}

// 前回（ドロップの連なりがあった直近の日）の最初の連なりの重量列
export function lastDropChain(sets, workouts, exerciseId, today) {
  const hasChain = (daySets) => toSlots(daySets).some((sl) => sl.drops.length > 0);
  const slot = toSlots(lastDaySets(sets, workouts, exerciseId, today, hasChain)).find((sl) => sl.drops.length > 0);
  return slot ? [slot.weight, ...slot.drops.map((d) => d.weight)] : [];
}

// 前回の同じ位置のドロップと同じ下げ幅。なければ刻み2つ分。刻み1つ分より下げない
export function nextDropWeight({ currentWeight, dropIndex, lastChain, step }) {
  const hasPos = lastChain.length > dropIndex;
  const decrement = hasPos ? lastChain[dropIndex - 1] - lastChain[dropIndex] : 2 * step;
  return round2(Math.max(step, currentWeight - decrement));
}

// 入力欄の文字列を数値に（全角数字可・解釈できない/負数は0・小数第2位で丸め）
export function parseNumberInput(text) {
  const half = String(text ?? '').replace(/[０-９．]/g, (c) => (c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xfee0))).trim();
  const n = parseFloat(half);
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

// today を含む直近 days 日のセット数を種目ごとに数える
export function exerciseUsage(sets, workouts, today, days = 28) {
  const from = addDays(today, -(days - 1));
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const usage = new Map();
  for (const s of sets) {
    const date = dateOf.get(s.workoutId);
    if (date === undefined || date < from || date > today) continue;
    usage.set(s.exerciseId, (usage.get(s.exerciseId) || 0) + 1);
  }
  return usage;
}

// よく使う順（同数は名前順）。元の配列は変えない
export function sortByUsage(exercises, usage) {
  return [...exercises].sort((a, b) =>
    (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || String(a.name).localeCompare(String(b.name), 'ja'));
}

// 次にやる種目の提案。コースがあればその順、なければ今の種目を前回やった日の順
export function suggestNext({ courseIds, currentExerciseId, doneTodayIds, sets, workouts, today, availableIds }) {
  const done = new Set(doneTodayIds);
  const available = new Set(availableIds);
  const ok = (id) => id !== currentExerciseId && !done.has(id) && available.has(id);
  if (courseIds && courseIds.length) return courseIds.find(ok) || null;

  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const dated = sets
    .map((s) => ({ s, date: dateOf.get(s.workoutId) }))
    .filter(({ date }) => date !== undefined && date < today);
  const lastDate = dated.filter(({ s }) => s.exerciseId === currentExerciseId)
    .map(({ date }) => date).sort().pop();
  if (!lastDate) return null;
  const firstAt = new Map();
  for (const { s, date } of dated) {
    if (date !== lastDate) continue;
    const t = num(s.createdAt);
    if (!firstAt.has(s.exerciseId) || t < firstAt.get(s.exerciseId)) firstAt.set(s.exerciseId, t);
  }
  const order = [...firstAt.keys()].sort((a, b) => firstAt.get(a) - firstAt.get(b));
  return order.slice(order.indexOf(currentExerciseId) + 1).find(ok) || null;
}

// 続いているドロップの連なりの、保存済みセット（時刻順）。空なら連なりは終わっている（押し間違いを消した場合など）
export function openDropChain(todaySets, drop) {
  if (!drop) return [];
  return todaySets.filter((s) => s.groupId === drop.groupId)
    .sort((a, b) => num(a.createdAt) - num(b.createdAt));
}
