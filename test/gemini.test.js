import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsightPrompt, buildCourseSuggestionPrompt, parseCourseSuggestion, callGemini } from '../js/lib/gemini.js';

test('buildInsightPrompt includes PR stats', () => {
  const stats = {
    prs: [{ name: 'ベンチプレス', pr: 126.7 }],
    recentCount: 12,
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /126\.7/);
  assert.doesNotMatch(p, /タグ/);
});

test('buildInsightPrompt includes workout notes', () => {
  const stats = {
    prs: [], recentCount: 3,
    workoutNotes: ['今日は調子が良かった', '腰に張りがある'],
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /今日は調子が良かった/);
  assert.match(p, /腰に張りがある/);
  assert.match(p, /感想/);
});

test('callGemini posts to endpoint and extracts text', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '改善案です' }] } }] }),
    };
  };
  const out = await callGemini('プロンプト', 'KEY123', { fetchImpl: fakeFetch });
  assert.equal(out, '改善案です');
  assert.match(captured.url, /gemini-2\.5-flash/);
  assert.match(captured.url, /key=KEY123/);
});

test('callGemini throws on http error', async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => callGemini('p', 'k', { fetchImpl: fakeFetch }), /429/);
});

test('buildCourseSuggestionPrompt includes exercise names and gap info', () => {
  const stats = {
    exercises: [{ name: 'ベンチプレス', bodyPart: '胸' }, { name: 'スクワット', bodyPart: '脚' }],
    gaps: [{ category: '胸', days: 5 }, { category: '脚', days: null }],
  };
  const p = buildCourseSuggestionPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /スクワット/);
  assert.match(p, /胸/);
  assert.match(p, /5/);
  assert.match(p, /JSON/);
});

test('parseCourseSuggestion parses plain JSON', () => {
  const text = '{"exercises": ["ベンチプレス", "スクワット"]}';
  assert.deepEqual(parseCourseSuggestion(text), ['ベンチプレス', 'スクワット']);
});

test('parseCourseSuggestion parses JSON wrapped in code fences', () => {
  const text = '```json\n{"exercises": ["デッドリフト"]}\n```';
  assert.deepEqual(parseCourseSuggestion(text), ['デッドリフト']);
});

test('parseCourseSuggestion returns empty array for invalid text', () => {
  assert.deepEqual(parseCourseSuggestion('すみません、提案できません'), []);
});

test('parseCourseSuggestion returns empty array when exercises field is not an array', () => {
  assert.deepEqual(parseCourseSuggestion('{"exercises": "ベンチプレス"}'), []);
});
