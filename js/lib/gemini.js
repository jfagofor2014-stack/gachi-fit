const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// 蓄積統計から日本語プロンプトを生成（純粋関数）
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const notes = (stats.workoutNotes || []).map((n) => `- ${n}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【最近の感想】', notes || '（なし）',
  ].join('\n');
}

// 登録種目と部位別の未トレーニング日数から、今日のコース提案プロンプトを生成（純粋関数）
export function buildCourseSuggestionPrompt(stats) {
  const exerciseList = (stats.exercises || [])
    .map((e) => `- ${e.name}（${e.bodyPart || '部位未設定'}）`).join('\n');
  const gapList = (stats.gaps || [])
    .map((g) => `- ${g.category}: ${g.days == null ? '未実施' : `${g.days}日前に実施`}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下の登録種目一覧の中から3〜6種目を選び、部位のバランスと各部位の直近の実施状況を考慮して、今日行うのに適したトレーニングコースを組んでください。',
    '登録種目一覧に存在する種目名のみを、他の説明文やコードフェンスを含めずに以下のJSON形式のみで出力してください。',
    '{"exercises": ["種目名1", "種目名2", ...]}',
    '',
    '【登録種目一覧】', exerciseList || '（なし）',
    '【部位別の直近実施状況】', gapList || '（記録なし）',
  ].join('\n');
}

// Gemini応答テキストから提案種目名の配列を抽出する（純粋関数、失敗時は空配列）
export function parseCourseSuggestion(text) {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleaned);
    return Array.isArray(data.exercises) ? data.exercises : [];
  } catch {
    return [];
  }
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
