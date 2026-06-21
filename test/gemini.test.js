import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsightPrompt, callGemini } from '../js/lib/gemini.js';

test('buildInsightPrompt includes PR and tag stats', () => {
  const stats = {
    prs: [{ name: 'ベンチプレス', pr: 126.7 }],
    tagFreq: [{ tag: '腹圧抜けた', count: 3 }],
    scoreCorr: [{ tag: '腹圧抜けた', direction: 'lower' }],
    recentCount: 12,
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /126\.7/);
  assert.match(p, /腹圧抜けた/);
});

test('buildInsightPrompt includes workout notes', () => {
  const stats = {
    prs: [], tagFreq: [], scoreCorr: [], recentCount: 3,
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
