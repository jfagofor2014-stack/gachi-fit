const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// 蓄積統計から日本語プロンプトを生成（純粋関数）
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const tags = (stats.tagFreq || []).map((t) => `- ${t.tag}（${t.count}回）`).join('\n');
  const corr = (stats.scoreCorr || [])
    .map((c) => `- ${c.tag}: 品質スコアが${c.direction === 'lower' ? '低い' : '高い'}傾向`)
    .join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【よく使うタグ】', tags || '（なし）',
    '【タグと品質スコアの傾向】', corr || '（なし）',
  ].join('\n');
}

// Gemini を呼び生成テキストを返す。fetchImpl 注入でテスト可能。
export async function callGemini(prompt, apiKey, { fetchImpl = fetch } = {}) {
  const resp = await fetchImpl(ENDPOINT(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) throw new Error(`Gemini APIエラー: ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
