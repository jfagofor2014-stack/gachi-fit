import { get, put } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { localDateStr } from '../lib/localdate.js';
import {
  computeCreature, weekStart, addDays, daysLeftInWeek, nextEvolutionIn, STAGE_NAMES,
  WEEKLY_GOAL, SESSION_MIN, LEAD_IN_MIN, GAIN_FULL, LOSS_ONE, LOSS_ZERO, BONUS_PER_EVENT, MAX_EVENTS,
} from '../lib/creature.js';
import { monsterSvg } from '../lib/creatureArt.js';

const DOC_ID = 'creature';
const MOOD_LABEL = { genki: '元気', normal: 'ふつう', shobori: 'しょんぼり' };
const HISTORY_WEEKS = 8;

const md = (dateStr) => {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
};

function weekIcon(w) {
  if (w.rest) return '休';
  if (!w.closed) return '進行中';
  if (w.qualified >= WEEKLY_GOAL) return '✔';
  return w.qualified === 1 ? '△' : '✕';
}

function deltaText(w) {
  if (w.rest) return '±0';
  if (!w.closed) return '集計中';
  return `${w.delta > 0 ? '+' : ''}${w.delta}`;
}

function weekMessage(c, today) {
  const w = c.current;
  if (w.rest) return '今週はお休み';
  if (w.qualified >= WEEKLY_GOAL) return '今週の目標達成！';
  return `あと${WEEKLY_GOAL - w.qualified}回で今週達成（残り${daysLeftInWeek(today)}日）`;
}

function weekRowHtml(w) {
  const sessions = w.sessions.length
    ? w.sessions.map((s) => `${md(s.date)} ${Math.round(s.minutes)}分${s.qualifies ? ' ✔' : ''}`).join('　')
    : '記録なし';
  return `<div class="creature-week-row">
    <div class="list-item" style="border:none;padding:0">
      <span><strong>${md(w.weekStart)}〜${md(addDays(w.weekStart, 6))}</strong> ${weekIcon(w)}</span>
      <span class="muted">${deltaText(w)}</span>
    </div>
    <div class="muted">${escapeHtml(sessions)}</div>
    <button type="button" class="btn creature-rest" data-rest-week="${w.weekStart}">${w.rest ? 'お休みを戻す' : 'お休みにする'}</button>
  </div>`;
}

const RULES_HTML = `<div class="muted" style="margin-top:10px;font-size:13px;line-height:1.7">
  <div>・週は月曜〜日曜。週が終わってから強さが増減します</div>
  <div>・トレーニングした日の所要時間が${SESSION_MIN}分以上で「達成」。手入力の開始・終了があればそれを使い、なければ最初と最後の記録の間隔に${LEAD_IN_MIN}分を足します</div>
  <div>・週${WEEKLY_GOAL}回以上で＋${GAIN_FULL}、1回で−${LOSS_ONE}、0回で−${LOSS_ZERO}。お休みの週は増減なし</div>
  <div>・自己ベスト（推定1RMか、同じ重量以上での最大回数）を更新した種目1つにつき＋${BONUS_PER_EVENT}（週${MAX_EVENTS}種目まで。1回以上達成した週のみ）</div>
</div>`;

// ホームの最上部にキャラのカードを描く。状態は保存せず、履歴から毎回計算する
export async function renderCreatureCard(box, { workouts, sets, exercises, silent = false }) {
  const wasOpen = Boolean(box.querySelector('#creature-details')?.open);
  const today = localDateStr();

  let doc = await get('goals', DOC_ID);
  if (!doc) {
    doc = { id: DOC_ID, startWeek: weekStart(today), restWeeks: [], lastSeenStage: null };
    await put('goals', doc);
  }
  const c = computeCreature({
    workouts, sets, exercises, startWeek: doc.startWeek, restWeeks: doc.restWeeks || [], today,
  });

  // 段階が変わっていたら、一度だけお知らせする（初回は黙って保存）
  let notice = '';
  if (doc.lastSeenStage !== c.stage) {
    if (!silent && typeof doc.lastSeenStage === 'number') {
      notice = c.stage > doc.lastSeenStage
        ? `進化した！ ${STAGE_NAMES[doc.lastSeenStage]} → ${STAGE_NAMES[c.stage]}`
        : `弱くなってしまった… ${STAGE_NAMES[c.stage]}に戻った`;
    }
    doc = { ...doc, lastSeenStage: c.stage };
    await put('goals', doc);
  }

  const next = nextEvolutionIn(c.power);
  const dots = Array.from({ length: WEEKLY_GOAL }, (_, i) => (i < Math.min(c.current.qualified, WEEKLY_GOAL) ? '●' : '○')).join(' ');
  const weeks = c.weeks.slice(-HISTORY_WEEKS).reverse();

  box.innerHTML = `
    ${notice ? `<div class="creature-notice">${escapeHtml(notice)}</div>` : ''}
    <div class="card creature">
      <div class="creature-main">
        <div class="creature-art" role="img" aria-label="${STAGE_NAMES[c.stage]}（${MOOD_LABEL[c.mood]}）">${monsterSvg(c.stage, c.mood)}</div>
        <div class="creature-info">
          <div class="creature-stage">${STAGE_NAMES[c.stage]} <span class="muted" style="font-size:14px;font-weight:600">${MOOD_LABEL[c.mood]}</span></div>
          <div class="creature-power"><div class="creature-power-fill" style="width:${c.power}%"></div></div>
          <div class="muted">強さ ${c.power}・${next === null ? '最高の姿' : `次の進化まであと${next}`}</div>
        </div>
      </div>
      <div class="creature-week">
        <span>今週</span><span class="creature-dots">${dots}</span><span>${escapeHtml(weekMessage(c, today))}</span>
      </div>
      <details id="creature-details">
        <summary>くわしく</summary>
        ${weeks.map(weekRowHtml).join('')}
        ${RULES_HTML}
      </details>
    </div>`;
  box.querySelector('#creature-details').open = wasOpen;

  box.querySelectorAll('[data-rest-week]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ws = btn.dataset.restWeek;
      const rest = new Set(doc.restWeeks || []);
      if (rest.has(ws)) rest.delete(ws); else rest.add(ws);
      await put('goals', { ...doc, restWeeks: [...rest].sort() });
      await renderCreatureCard(box, { workouts, sets, exercises, silent: true });
    }));
}
