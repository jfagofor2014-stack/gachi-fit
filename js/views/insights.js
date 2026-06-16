import { getAll } from '../db.js';
import { tagFrequency, tagScoreCorrelation, tag1RMCorrelation } from '../lib/insights.js';
import { escapeHtml } from './exercises.js';

export async function renderInsights(el) {
  const logs = await getAll('sensoryLogs');
  const sets = await getAll('sets');

  if (sets.length < 5) {
    el.innerHTML = `<h2 class="view-title">インサイト</h2>
      <div class="card"><p class="muted">データを蓄積中です（5セット以上で分析を表示）。現在 ${sets.length} セット。</p></div>`;
    return;
  }

  const recent = logs.slice(-30);
  const freq = tagFrequency(recent);
  const scoreCorr = tagScoreCorrelation(recent, 1.0);
  const rmCorr = tag1RMCorrelation(logs, sets, 5);

  const freqHtml = freq.length
    ? freq.map((f) => `<span class="chip">${escapeHtml(f.tag)} ×${f.count}</span>`).join('')
    : '<p class="muted">タグの記録がありません。</p>';

  const scoreHtml = scoreCorr.length
    ? scoreCorr.map((c) => `<div class="list-item">
        <span>${escapeHtml(c.tag)}</span>
        <span class="muted">品質スコアが全体より${c.direction === 'higher' ? '高い' : '低い'}傾向（平均 ${c.avg.toFixed(1)} / 全体 ${c.overall.toFixed(1)}）</span>
      </div>`).join('')
    : '<p class="muted">際立った傾向はまだありません。</p>';

  const rmHtml = rmCorr.length
    ? rmCorr.map((c) => `<div class="list-item">
        <span>${escapeHtml(c.tag)}</span>
        <span class="muted">推定1RMが全体より${c.direction === 'higher' ? '高い' : '低い'}傾向（平均 ${c.avg.toFixed(1)}kg / 全体 ${c.overall.toFixed(1)}kg）</span>
      </div>`).join('')
    : '<p class="muted">際立った傾向はまだありません。</p>';

  el.innerHTML = `
    <h2 class="view-title">インサイト</h2>
    <div class="card"><strong>よく使うタグ（直近30件）</strong><div style="margin-top:8px">${freqHtml}</div></div>
    <div class="card"><strong>タグ × 品質スコア</strong>${scoreHtml}</div>
    <div class="card"><strong>タグ × 推定1RM</strong>${rmHtml}</div>`;
}
