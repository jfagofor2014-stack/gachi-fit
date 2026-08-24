// 'YYYY-MM-DD' に日数を足した 'YYYY-MM-DD' を返す
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// today を含む days 日間の予定を、日付昇順・同日内は時刻昇順で返す
export function upcomingPlans(plans, today, days) {
  const last = addDays(today, days - 1);
  return plans
    .filter((p) => p.date >= today && p.date <= last)
    .sort((a, b) => (a.date === b.date
      ? a.startTime.localeCompare(b.startTime)
      : a.date.localeCompare(b.date)));
}

// 日付ごとにまとめた [{date, plans}] を日付昇順で返す
export function groupPlansByDate(plans) {
  const byDate = new Map();
  for (const p of plans) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date, plans: list }));
}

// 自分が作成した予定かどうか
export function canEditPlan(plan, currentUserEmail) {
  return Boolean(plan.ownerEmail) && plan.ownerEmail === currentUserEmail;
}
