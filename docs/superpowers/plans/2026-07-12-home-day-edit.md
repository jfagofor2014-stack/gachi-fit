# ホーム画面カレンダーからの過去日程編集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム画面のカレンダーで日をタップした際の詳細表示に、感想の編集（自動保存）と既存セットの編集・削除を追加する。

**Architecture:** `js/views/home.js` の `renderDayDetail` 関数を拡張する。既存の「振り返り」タブ（`js/views/review.js`）や記録タブの `renderToday`（`js/views/workout.js`）と同じパターン（`openSetEditor`での編集、`remove`での削除、`change`イベントでの自動保存）を踏襲する。新規ファイルなし。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 過去日への新規セット追加は対象外（既存セットの編集・削除とメモ編集のみ）
- 感想欄は`change`イベントで自動保存（保存ボタン・完了メッセージなし、`review.js`の`.wnote`と同じパターン）
- カレンダーの「実施日」マークはその場では更新しない（日別詳細パネル内の削除操作では`renderHome`全体を再実行しない、既知の制約として許容）
- 既存 `getAll`/`get`/`put`/`remove`、`openSetEditor`、`escapeHtml`、`formatMinutes`、`workoutToMarkdown`/`buildObsidianUri`/`downloadText` に準拠

---

## Task 1: ホーム画面の日別詳細に編集機能を追加（home.js）

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `openSetEditor(setId, onDone)`（`./set-editor.js`）、`put`/`remove`（`../db.js`）
- Produces: `renderDayDetail(box, date, { exercises, nameOf })` の外部シグネチャは変更なし（`renderHome`からの呼び出し方は変わらない）

- [ ] **Step 1: importにput/remove/openSetEditorを追加**

`js/views/home.js` の1行目を次に置き換え：
```js
import { getAll, get, put, remove } from '../db.js';
```
6行目（`import { renderCalendar } from './calendar.js';`）の直後に追加：
```js
import { openSetEditor } from './set-editor.js';
```

- [ ] **Step 2: renderDayDetailを書き換え**

`js/views/home.js` の `renderDayDetail` 関数全体（`async function renderDayDetail(box, date, { exercises, nameOf }) { ... }`）を次に置き換え：
```js
async function renderDayDetail(box, date, { exercises, nameOf }) {
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === date);
  if (!workout) { box.innerHTML = `<p class="muted">${date}：この日の記録はありません</p>`; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const logs = await getAll('sensoryLogs');
  let placeName = '';
  if (workout.placeId) {
    const place = (await getAll('places')).find((p) => p.id === workout.placeId);
    placeName = place ? place.name : '';
  }
  const meta = [
    placeName ? `場所: ${escapeHtml(placeName)}` : '',
    workout.durationSec ? `時間: ${formatMinutes(workout.durationSec)}` : '',
  ].filter(Boolean).join(' / ');

  const rows = sets.map((s) => `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}<br>
        <span class="muted" style="font-size:12px">1RM ${s.estimated1RM.toFixed(0)}</span></span>
      <span>
        <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
        <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
      </span>
    </div>`).join('') || '<p class="muted">セットなし</p>';

  box.innerHTML = `<strong>${date}</strong>
    ${meta ? `<div class="muted" style="margin:4px 0">${meta}</div>` : ''}
    ${rows}
    <div class="field" style="margin-top:8px"><label>感想</label>
      <textarea id="day-note" class="input" rows="3" style="resize:vertical">${escapeHtml(workout.note || '')}</textarea></div>
    <div class="row" style="margin-top:10px">
      <button id="day-obsidian" class="btn btn-primary">Obsidianに送る</button>
      <button id="day-md" class="btn">Markdown DL</button>
    </div>
    <div id="day-export-msg" class="muted" style="margin-top:6px"></div>`;

  const data = buildDayData(date, workout, sets, exercises, placeName, logs);
  const fileName = `gachi-fit-${date}.md`;
  box.querySelector('#day-obsidian').addEventListener('click', () => {
    const vault = (localStorage.getItem('obsidian_vault') || '').trim();
    if (!vault) { box.querySelector('#day-export-msg').textContent = '設定でvault名を登録してください。'; return; }
    const folder = (localStorage.getItem('obsidian_folder') || '').trim().replace(/^\/+|\/+$/g, '');
    const obsidianFile = folder ? `${folder}/${fileName}` : fileName;
    location.href = buildObsidianUri(vault, obsidianFile, workoutToMarkdown(data));
  });
  box.querySelector('#day-md').addEventListener('click', () => {
    downloadText(workoutToMarkdown(data), fileName);
  });

  box.querySelector('#day-note').addEventListener('change', async (e) => {
    const w = await get('workouts', workout.id);
    if (w) { w.note = e.target.value; await put('workouts', w); }
  });

  box.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openSetEditor(b.dataset.edit, () => renderDayDetail(box, date, { exercises, nameOf }))));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await remove('sets', b.dataset.del);
      const allLogs = await getAll('sensoryLogs');
      for (const l of allLogs.filter((l) => l.setId === b.dataset.del)) await remove('sensoryLogs', l.id);
      renderDayDetail(box, date, { exercises, nameOf });
    }));
}
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/home.js && echo OK`
Expected: `OK`

- [ ] **Step 4: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存57件がそのまま通ること。home.jsはビュー層のため新規テストなし）

- [ ] **Step 5: ブラウザで動作確認**

preview で、記録タブから何かセットを保存済みの状態にした上でホームタブを開き：
- カレンダーの実施日（緑マーク）をタップ→日別詳細に、セット一覧・「感想」テキストエリア（既存の感想があれば入っている）・Obsidian/MD DLボタンが表示される
- 感想テキストエリアを書き換えてフォーカスを外す→同じ日を再タップ（または他の日をタップしてから戻る）→変更した感想が保持されていることを確認
- その他タブ→振り返りで同じ日のワークアウトメモを確認し、ホームで編集した内容と一致していることを確認（同じ`workout.note`を参照）
- セットの「編集」ボタン→モーダルで重量を変更して保存→日別詳細のセット行に新しい重量が反映される
- セットの「削除」ボタン→そのセットが一覧から消える。振り返りタブでも同じセットが消えていることを確認
- コンソールにエラーが出ていないことを確認

- [ ] **Step 6: コミット**

```bash
git add js/views/home.js
git commit -m "feat: allow editing note and sets for past dates from home calendar"
```

---

## Task 2: PWAキャッシュ更新

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v15';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v16';
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v16 for home calendar day edit"
```

---

## Self-Review チェック結果
- **スペック網羅**：感想編集（Task1 Step2の`#day-note`）・セット編集削除（Task1 Step2の`[data-edit]`/`[data-del]`）・PWA更新（Task2）すべてタスク化。新規セット追加は対象外として明記済み（実装なし）。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`renderDayDetail(box, date, {exercises, nameOf})`のシグネチャはTask1内で一貫。`openSetEditor(setId, onDone)`は既存の`set-editor.js`のシグネチャと一致（他の呼び出し元`workout.js`/`review.js`と同じ使い方）。
