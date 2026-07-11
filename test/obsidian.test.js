import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutToMarkdown, buildObsidianUri } from '../js/lib/obsidian.js';

const sample = {
  date: '2026-06-22',
  place: '〇〇ジム',
  durationMin: 90,
  note: '胸の張りが良い',
  volume: { 胸: 600 },
  exercises: [
    { name: 'ベンチプレス', category: '胸', sets: [
      { weight: 100, reps: 6, assistedReps: 0, estimated1RM: 120, note: '' },
      { weight: 100, reps: 5, assistedReps: 2, estimated1RM: 116, note: '効き浅い' },
    ] },
  ],
};

test('workoutToMarkdown includes frontmatter, heading, sets, volume, note', () => {
  const md = workoutToMarkdown(sample);
  assert.match(md, /^---\n/);
  assert.match(md, /date: 2026-06-22/);
  assert.match(md, /place: 〇〇ジム/);
  assert.match(md, /duration_min: 90/);
  assert.match(md, /volume_胸: 600/);
  assert.match(md, /tags: \[gachi-fit\]/);
  assert.match(md, /# 2026-06-22 トレーニング/);
  assert.match(md, /## ベンチプレス（胸）/);
  assert.match(md, /- 100kg × 6（推定1RM 120）/);
  assert.match(md, /- 100kg × 5（補助2）（推定1RM 116） — メモ: 効き浅い/);
  assert.match(md, /## 感想\n胸の張りが良い/);
});

test('workoutToMarkdown omits empty place and note', () => {
  const md = workoutToMarkdown({ date: '2026-06-22', place: '', durationMin: 0, note: '', volume: {}, exercises: [] });
  assert.doesNotMatch(md, /place:/);
  assert.doesNotMatch(md, /duration_min:/);
  assert.doesNotMatch(md, /## 感想/);
  assert.match(md, /# 2026-06-22 トレーニング/);
});

test('buildObsidianUri encodes vault, file, content', () => {
  const uri = buildObsidianUri('My Vault', 'gachi-fit-2026-06-22.md', '# 見出し');
  assert.match(uri, /^obsidian:\/\/new\?/);
  assert.match(uri, /vault=My%20Vault/);
  assert.match(uri, /file=gachi-fit-2026-06-22\.md/);
  assert.match(uri, /content=%23%20/);
});
