# ジム予定の共有 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メンバー間で「いつ・どこのジムに・何時に行く予定か」を共有できるようにし、後続の記録共有の土台となる認証・共有データ基盤を用意する。

**Architecture:** 既存の IndexedDB データには一切触れず、予定だけを Firestore に置く。Firebase SDK は CDN から動的 import し、読み込みや設定に失敗した場合は共有UIを描画しないだけでアプリ本体は通常どおり動く。純粋な絞り込み・整列ロジックは `js/lib/plans.js` に隔離してユニットテストする。

**Tech Stack:** Vanilla JS（ESモジュール、ビルドなし）、Firebase Authentication（Google）＋ Cloud Firestore（CDN の modular ESM SDK）、Node標準 `node:test`。

## Global Constraints

- **`js/db.js` は変更しない。** `DB_VERSION` は 4 のまま、`STORES` にも追加しない。既存の10ストア（`exercises` / `workouts` / `sets` / `sensoryLogs` / `photos` / `goals` / `bodyWeights` / `setPatterns` / `places` / `courses`）は同期対象外
- 体重・体形写真・トレーニング記録を Firestore に書き込まない
- **サインインは任意。未ログインでも既存の全機能が従来どおり動くこと**（ログインウォールにしない）
- Firebase SDK の動的 import と初期化は try/catch で囲み、失敗時は「みんなの予定」カードを描画しないだけでホームの他の要素は通常どおり表示する
- 他メンバーの入力（`ownerName` / `placeName` / `note`）を描画する箇所はすべて `escapeHtml`（`js/lib/html.js`）を通す
- 予定の表示は当日を含む7日間のみ（`date` が今日以上、今日の6日後以下）
- 新規JSファイルは必ず `sw.js` の `ASSETS` 配列に追加する
- Firebase SDK のバージョンは `11.0.2` に固定し、全 import で同一バージョンを使う

---

### Task 1: 予定の絞り込み・整列ロジック（純粋関数）

**Files:**
- Create: `js/lib/plans.js`
- Test: `test/plans.test.js`

**Interfaces:**
- Consumes: なし（純粋関数）
- Produces:
  - `upcomingPlans(plans, today, days): plan[]`
  - `groupPlansByDate(plans): {date: string, plans: plan[]}[]`
  - `canEditPlan(plan, currentUserEmail): boolean`
  
  `plan` は `{id, ownerEmail, ownerName, date: 'YYYY-MM-DD', startTime: 'HH:MM', placeName, note, updatedAt}`。Task 4（home.js）と Task 3（plan-editor.js）がこれらを使う。

- [ ] **Step 1: Write the failing tests**

`test/plans.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingPlans, groupPlansByDate, canEditPlan } from '../js/lib/plans.js';

const p = (id, date, startTime, ownerEmail = 'a@example.com') =>
  ({ id, date, startTime, ownerEmail, ownerName: 'A', placeName: 'ジム', note: '' });

test('upcomingPlans excludes past dates', () => {
  const plans = [p('1', '2026-08-23', '19:00'), p('2', '2026-08-24', '19:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['2']);
});

test('upcomingPlans includes today', () => {
  const plans = [p('1', '2026-08-24', '07:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['1']);
});

test('upcomingPlans includes the last day of the window but not the day after', () => {
  const plans = [p('1', '2026-08-30', '19:00'), p('2', '2026-08-31', '19:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['1']);
});

test('upcomingPlans sorts by date then start time', () => {
  const plans = [
    p('1', '2026-08-26', '19:00'),
    p('2', '2026-08-24', '20:00'),
    p('3', '2026-08-24', '07:00'),
  ];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['3', '2', '1']);
});

test('upcomingPlans returns empty array for no plans', () => {
  assert.deepEqual(upcomingPlans([], '2026-08-24', 7), []);
});

test('groupPlansByDate groups by date in ascending order', () => {
  const plans = [
    p('1', '2026-08-24', '07:00'),
    p('2', '2026-08-26', '19:00'),
    p('3', '2026-08-24', '20:00'),
  ];
  const groups = groupPlansByDate(plans);
  assert.deepEqual(groups.map((g) => g.date), ['2026-08-24', '2026-08-26']);
  assert.deepEqual(groups[0].plans.map((x) => x.id), ['1', '3']);
  assert.deepEqual(groups[1].plans.map((x) => x.id), ['2']);
});

test('groupPlansByDate returns empty array for no plans', () => {
  assert.deepEqual(groupPlansByDate([]), []);
});

test('canEditPlan is true for own plan', () => {
  assert.equal(canEditPlan(p('1', '2026-08-24', '19:00', 'me@example.com'), 'me@example.com'), true);
});

test('canEditPlan is false for someone elses plan', () => {
  assert.equal(canEditPlan(p('1', '2026-08-24', '19:00', 'other@example.com'), 'me@example.com'), false);
});

test('canEditPlan is false when ownerEmail is missing', () => {
  assert.equal(canEditPlan({ id: '1', date: '2026-08-24', startTime: '19:00' }, 'me@example.com'), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL（`Cannot find module '../js/lib/plans.js'`）

- [ ] **Step 3: Implement**

`js/lib/plans.js` を新規作成:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`
Expected: 全件PASS（既存83件＋新規10件＝93件）

- [ ] **Step 5: Commit**

```bash
git add js/lib/plans.js test/plans.test.js
git commit -m "feat: add pure helpers for filtering and grouping crew plans"
```

---

### Task 2: Firebase 設定と認証・Firestore 連携モジュール

**Files:**
- Create: `js/lib/firebase-config.js`
- Create: `js/lib/crew.js`
- Create: `firestore.rules`
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces（Task 3・4・5 が使う）:
  - `isCrewConfigured(): boolean` — Firebase 設定が実値で埋まっているか
  - `initCrew(): Promise<{auth, db, mod} | null>` — SDK を動的 import して初期化。未設定・失敗時は `null`
  - `watchAuth(cb): Promise<() => void>` — サインイン状態の変化で `cb(user | null)` を呼び、**購読解除関数を返す**。`user` は `{email, displayName}`
  - `signIn(): Promise<void>` / `signOutCrew(): Promise<void>`
  - `watchPlans(cb): Promise<() => void>` — 予定の購読。`cb(plans)` を呼び、購読解除関数を返す。`plans` の各要素は Firestore のドキュメントデータに `id` を足したもの
  - `savePlan(plan): Promise<void>` — `plan.id` があれば更新、なければ作成
  - `deletePlan(id): Promise<void>`

- [ ] **Step 1: `js/lib/firebase-config.js` を作成**

Firebase の Web 設定値は秘密情報ではない（アクセス制御は Firestore ルールで行う）ため、リポジトリにコミットする。プロジェクト作成前はプレースホルダのままとし、`isCrewConfigured()` がこれを検出して共有機能を休眠させる。

```js
// Firebase コンソールで「ウェブアプリを追加」して得た値をここに貼る。
// 未設定（'REPLACE_ME' のまま）の間は共有機能が無効になり、アプリはローカル専用として動く。
// このキーは秘密情報ではない。アクセス制御は firestore.rules のメール許可リストで行う。
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};
```

- [ ] **Step 2: `js/lib/crew.js` を作成**

```js
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const CREW_PATH = ['crews', 'main', 'plans'];

let ctx = null;
let initTried = false;

// 設定値がプレースホルダのままなら未設定とみなす
export function isCrewConfigured() {
  return Object.values(firebaseConfig).every((v) => v && v !== 'REPLACE_ME');
}

// SDK を動的 import して初期化する。未設定・読み込み失敗時は null を返す
export async function initCrew() {
  if (ctx) return ctx;
  if (initTried) return null;
  initTried = true;
  if (!isCrewConfigured()) return null;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({}) });
    } catch {
      db = fsMod.getFirestore(app);
    }
    ctx = { auth: authMod.getAuth(app), db, authMod, fsMod };
    return ctx;
  } catch {
    return null;
  }
}

// サインイン状態を購読する。購読解除関数を返す（未設定時は何もしない関数）
export async function watchAuth(cb) {
  const c = await initCrew();
  if (!c) { cb(null); return () => {}; }
  return c.authMod.onAuthStateChanged(c.auth, (u) =>
    cb(u ? { email: u.email, displayName: u.displayName || u.email } : null));
}

export async function signIn() {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  await c.authMod.signInWithPopup(c.auth, new c.authMod.GoogleAuthProvider());
}

export async function signOutCrew() {
  const c = await initCrew();
  if (!c) return;
  await c.authMod.signOut(c.auth);
}

function plansCol(c) {
  return c.fsMod.collection(c.db, ...CREW_PATH);
}

// 予定を購読する。購読解除関数を返す
export async function watchPlans(cb) {
  const c = await initCrew();
  if (!c) return () => {};
  return c.fsMod.onSnapshot(
    plansCol(c),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export async function savePlan(plan) {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  const { id, ...data } = plan;
  data.updatedAt = Date.now();
  if (id) {
    await c.fsMod.updateDoc(c.fsMod.doc(c.db, ...CREW_PATH, id), data);
  } else {
    await c.fsMod.addDoc(plansCol(c), data);
  }
}

export async function deletePlan(id) {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  await c.fsMod.deleteDoc(c.fsMod.doc(c.db, ...CREW_PATH, id));
}
```

- [ ] **Step 3: `firestore.rules` を作成**

Firebase コンソールに貼り付ける内容をリポジトリにも記録しておく（デプロイは手動）。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function members() {
      return [
        'jfagofor2014@gmail.com'
      ];
    }
    function isMember() {
      return request.auth != null && request.auth.token.email in members();
    }
    match /crews/main/plans/{planId} {
      allow read: if isMember();
      allow create: if isMember()
        && request.resource.data.ownerEmail == request.auth.token.email;
      allow update, delete: if isMember()
        && resource.data.ownerEmail == request.auth.token.email;
    }
  }
}
```

- [ ] **Step 4: `sw.js` の ASSETS に追加**

`js/lib/...` が並ぶ行の末尾に `'js/lib/plans.js', 'js/lib/crew.js', 'js/lib/firebase-config.js',` を追加する。`firestore.rules` は配信対象ではないので追加しない。

- [ ] **Step 5: テストとブラウザで確認**

Run: `npm test 2>&1 | tail -10`
Expected: 93件すべてPASS（このタスクはテスト追加なし。`crew.js` は外部通信を含むため既存方針どおりユニットテスト対象外）

ブラウザ確認（リポジトリルートで `python3 -m http.server 8820` を起動し `preview_start` で `{"url":"http://localhost:8820"}`）:
`javascript_tool` で以下を実行し、**プレースホルダ設定のまま安全に無効化されること**を確認する:

```js
import('/js/lib/crew.js').then(async (m) => ({
  configured: m.isCrewConfigured(),   // false であること
  ctx: await m.initCrew(),            // null であること
  unsub: typeof (await m.watchPlans(() => {})), // 'function' であること（例外を投げない）
}))
```

全4タブを開き `read_console_messages` でエラーが出ていないことを確認する。

- [ ] **Step 6: Commit**

```bash
git add js/lib/firebase-config.js js/lib/crew.js firestore.rules sw.js
git commit -m "feat: add Firebase auth and Firestore wiring for crew plans"
```

---

### Task 3: 予定の追加・編集モーダル

**Files:**
- Create: `js/views/plan-editor.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `savePlan(plan)`（`js/lib/crew.js`、Task 2）、`escapeHtml`（`js/lib/html.js`）、`getAll`（`js/db.js`）、`localDateStr`（`js/lib/localdate.js`）
- Produces: `openPlanEditor(plan, user, onDone): Promise<void>` — `plan` は編集時に既存の予定オブジェクト、新規時は `null`。`user` は `{email, displayName}`。保存・削除の完了後に `onDone()` を呼ぶ。Task 4（home.js）が使う。

- [ ] **Step 1: `js/views/plan-editor.js` を作成**

既存の `js/views/set-editor.js` と同じモーダル方式（`document.body` に追加する固定配置の `.card`）を踏襲する。z-index は先のリファクタリングで導入した `--z-modal` を使う。

```js
import { getAll } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { localDateStr } from '../lib/localdate.js';
import { savePlan, deletePlan } from '../lib/crew.js';

export async function openPlanEditor(plan, user, onDone) {
  const places = await getAll('places');
  const isNew = !plan;
  const cur = plan || { date: localDateStr(), startTime: '', placeName: '', note: '' };

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:var(--z-modal);background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">${isNew ? '予定を追加' : '予定を編集'}</h2>
    <div class="field"><label>日付</label>
      <input id="p-date" type="date" class="input" value="${escapeHtml(cur.date)}" /></div>
    <div class="field"><label>時刻</label>
      <input id="p-time" type="time" class="input" value="${escapeHtml(cur.startTime)}" /></div>
    ${places.length ? `<div class="field"><label>登録済みジムから選ぶ</label>
      <select id="p-place-sel" class="input">
        <option value="">選択してください</option>
        ${places.map((pl) => `<option value="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</option>`).join('')}
      </select></div>` : ''}
    <div class="field"><label>ジム名</label>
      <input id="p-place" class="input" placeholder="例: ゴールドジム渋谷" value="${escapeHtml(cur.placeName)}" /></div>
    <div class="field"><label>メモ（任意）</label>
      <input id="p-note" class="input" placeholder="例: 脚の日、補助してくれる人歓迎" value="${escapeHtml(cur.note || '')}" /></div>
    <div id="p-error" class="error"></div>
    <button id="p-save" class="btn btn-primary btn-block mt-2">保存</button>
    ${isNew ? '' : '<button id="p-delete" class="btn btn-danger btn-block mt-2">削除</button>'}
    <button id="p-cancel" class="btn btn-block mt-2">キャンセル</button>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();

  const sel = modal.querySelector('#p-place-sel');
  if (sel) {
    sel.addEventListener('change', () => {
      if (sel.value) modal.querySelector('#p-place').value = sel.value;
    });
  }

  modal.querySelector('#p-cancel').addEventListener('click', close);

  modal.querySelector('#p-save').addEventListener('click', async () => {
    const err = modal.querySelector('#p-error');
    const date = modal.querySelector('#p-date').value;
    const startTime = modal.querySelector('#p-time').value;
    const placeName = modal.querySelector('#p-place').value.trim();
    if (!date || !startTime || !placeName) {
      err.textContent = '日付・時刻・ジム名を入力してください'; return;
    }
    err.textContent = '';
    try {
      await savePlan({
        id: plan ? plan.id : undefined,
        ownerEmail: user.email,
        ownerName: user.displayName,
        date, startTime, placeName,
        note: modal.querySelector('#p-note').value.trim(),
      });
      close();
      onDone();
    } catch (e) {
      err.textContent = '保存できませんでした: ' + e.message;
    }
  });

  const delBtn = modal.querySelector('#p-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const err = modal.querySelector('#p-error');
      try {
        await deletePlan(plan.id);
        close();
        onDone();
      } catch (e) {
        err.textContent = '削除できませんでした: ' + e.message;
      }
    });
  }
}
```

- [ ] **Step 2: `sw.js` の ASSETS に `js/views/plan-editor.js` を追加**

- [ ] **Step 3: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 93件すべてPASS（ビュー層のためユニットテスト追加なし）

- [ ] **Step 4: Commit**

```bash
git add js/views/plan-editor.js sw.js
git commit -m "feat: add plan editor modal for crew gym plans"
```

---

### Task 4: ホームの「みんなの予定」カード

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `upcomingPlans` / `groupPlansByDate` / `canEditPlan`（`js/lib/plans.js`、Task 1）、`watchAuth` / `watchPlans`（`js/lib/crew.js`、Task 2）、`openPlanEditor(plan, user, onDone)`（`js/views/plan-editor.js`、Task 3）、`escapeHtml`、`localDateStr`
- Produces: なし（末端のビュー）

- [ ] **Step 1: import を追加**

`js/views/home.js` の先頭の import 群に次の3行を追加する:

```js
import { upcomingPlans, groupPlansByDate, canEditPlan } from '../lib/plans.js';
import { watchAuth, watchPlans } from '../lib/crew.js';
import { openPlanEditor } from './plan-editor.js';
```

- [ ] **Step 2: カードの器を `el.innerHTML` に追加**

`js/views/home.js` の `el.innerHTML` テンプレートで、`${suggestCard}` の**直後**に次を挿入する:

```js
    <div id="crew-card"></div>
```

- [ ] **Step 3: カードを描画する処理を追加**

`renderHome` はタブを開くたびに呼ばれるため、購読をモジュールレベルで保持し、再描画のたびに前回ぶんを解除する。解除しないと、ホームに戻るたびに認証リスナーが増え続け、破棄済みDOMを掴んだまま蓄積する。

`js/views/home.js` の import 群の直後（`export async function renderHome` の前）に次を追加する:

```js
let unsubCrewAuth = null;
let unsubCrewPlans = null;
```

`renderHome` 関数の末尾（既存の `.vol-row` のイベント登録ループの後、関数の閉じ括弧の直前）に次を追加する:

```js
  // みんなの予定（Firebase 未設定・未ログイン・SDK読み込み失敗時は何も描画しない）
  if (unsubCrewAuth) { unsubCrewAuth(); unsubCrewAuth = null; }
  if (unsubCrewPlans) { unsubCrewPlans(); unsubCrewPlans = null; }
  const crewBox = el.querySelector('#crew-card');
  unsubCrewAuth = await watchAuth(async (user) => {
    if (unsubCrewPlans) { unsubCrewPlans(); unsubCrewPlans = null; }
    if (!user) { crewBox.innerHTML = ''; return; }
    unsubCrewPlans = await watchPlans((plans) => renderCrewCard(crewBox, plans, user));
  });
```

- [ ] **Step 4: `renderCrewCard` を追加**

`js/views/home.js` のファイル末尾（`buildDayData` 関数の後）に次を追加する:

```js
const CREW_DAYS = 7;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatPlanDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  const wd = WEEKDAYS[new Date(dateStr + 'T00:00:00').getDay()];
  return `${Number(m)}/${Number(d)} (${wd})`;
}

function renderCrewCard(box, plans, user) {
  const groups = groupPlansByDate(upcomingPlans(plans, localDateStr(), CREW_DAYS));
  const body = groups.length
    ? groups.map((g) => `
        <div class="mt-2"><strong>${escapeHtml(formatPlanDate(g.date))}</strong></div>
        ${g.plans.map((p) => `
          <div class="list-item">
            <span>${escapeHtml(p.startTime)}　${escapeHtml(p.placeName)}
              <br><span class="muted" style="font-size:12px">${escapeHtml(p.ownerName)}${p.note ? '｜' + escapeHtml(p.note) : ''}</span></span>
            ${canEditPlan(p, user.email)
              ? `<span><button class="btn btn-edit btn-sm" data-plan-edit="${escapeHtml(p.id)}">編集</button></span>`
              : ''}
          </div>`).join('')}`).join('')
    : '<p class="muted mt-2">まだ予定がありません。</p>';

  box.innerHTML = `
    <div class="card">
      <div class="list-item" style="border:none;padding:0">
        <strong>みんなの予定</strong>
        <button type="button" id="crew-add" class="btn btn-sm">＋ 予定を追加</button>
      </div>
      ${body}
    </div>`;

  const reload = () => {};
  box.querySelector('#crew-add').addEventListener('click', () =>
    openPlanEditor(null, user, reload));
  box.querySelectorAll('[data-plan-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === b.dataset.planEdit);
      if (plan) openPlanEditor(plan, user, reload);
    }));
}
```

`reload` が空関数なのは意図的である。`watchPlans` の `onSnapshot` が保存・削除を検知して `renderCrewCard` を呼び直すため、明示的な再取得は不要。

- [ ] **Step 5: テストとブラウザで確認**

Run: `npm test 2>&1 | tail -10`
Expected: 93件すべてPASS

ブラウザ確認（`python3 -m http.server 8821`、`resize_window` で `{"preset":"mobile"}`）:
1. Firebase 未設定の状態でホームを開き、**「みんなの予定」カードが表示されないこと**
2. ホームの他の要素（挨拶カード・カレンダー・推定1RM）が従来どおり表示されること
3. `read_console_messages` でエラーがないこと
4. `document.body.scrollWidth <= window.innerWidth`

5. `#crew-card` の器自体は存在し、中身が空であること。`javascript_tool` で確認する:

```js
(() => {
  const box = document.querySelector('#crew-card');
  return { exists: !!box, empty: box ? box.innerHTML.trim() === '' : null };
})()
```

6. ホーム→記録→ホーム→記録と4回タブを往復してからホームに戻り、`#crew-card` が1つだけで中身が空のままであること（購読解除が効いていることの確認）:

```js
document.querySelectorAll('#crew-card').length
```

`renderCrewCard` の実描画は Firebase 設定後にしか走らない。このタスクでは「未設定時に何も出ない・既存機能が無傷・購読が蓄積しない」までを確認すればよい。

- [ ] **Step 6: Commit**

```bash
git add js/views/home.js
git commit -m "feat: show crew gym plans on the home screen"
```

---

### Task 5: 設定でのサインイン／サインアウト

**Files:**
- Modify: `js/views/settings.js`

**Interfaces:**
- Consumes: `isCrewConfigured` / `watchAuth` / `signIn` / `signOutCrew`（`js/lib/crew.js`、Task 2）、`escapeHtml`（`js/lib/html.js`）
- Produces: なし

- [ ] **Step 1: import を追加**

`js/views/settings.js` の先頭に次の2行を追加する:

```js
import { escapeHtml } from '../lib/html.js';
import { isCrewConfigured, watchAuth, signIn, signOutCrew } from '../lib/crew.js';
```

- [ ] **Step 2: カードを追加**

`js/views/settings.js` の `el.innerHTML` の中で、「既定インターバル秒数」のカード（`<strong>既定インターバル秒数</strong>` を含む `<div class="card">`）の**直前**に次を挿入する:

```js
    <div class="card">
      <strong>メンバー共有</strong>
      <p class="muted">サインインすると、ホームでメンバーのジム予定を共有できます。</p>
      <div id="s-crew"></div>
    </div>
```

- [ ] **Step 3: 結線処理を追加**

`renderSettings` 関数の末尾（関数の閉じ括弧の直前）に次を追加する:

```js
  const crewBox = el.querySelector('#s-crew');
  if (!isCrewConfigured()) {
    crewBox.innerHTML = '<p class="muted">共有機能は未設定です。</p>';
  } else {
    watchAuth((user) => {
      crewBox.innerHTML = user
        ? `<p class="muted">${escapeHtml(user.displayName)}（${escapeHtml(user.email)}）でサインイン中</p>
           <button id="s-signout" class="btn btn-block mt-2">サインアウト</button>`
        : '<button id="s-signin" class="btn btn-primary btn-block mt-2">Googleでサインイン</button>';
      const inBtn = crewBox.querySelector('#s-signin');
      if (inBtn) inBtn.addEventListener('click', async () => {
        try { await signIn(); }
        catch (e) { crewBox.innerHTML = `<p class="error">サインインできませんでした: ${escapeHtml(e.message)}</p>`; }
      });
      const outBtn = crewBox.querySelector('#s-signout');
      if (outBtn) outBtn.addEventListener('click', () => signOutCrew());
    });
  }
```

- [ ] **Step 4: テストとブラウザで確認**

Run: `npm test 2>&1 | tail -10`
Expected: 93件すべてPASS

ブラウザ確認（`python3 -m http.server 8822`、mobile幅）:
1. 管理タブ →「設定」セグメントを開き、「メンバー共有」カードが表示され、未設定時は「共有機能は未設定です。」と出ること
2. 設定タブの他の項目（既定インターバル秒数・Gemini APIキー・Obsidian・大会目標・セットパターン・バックアップ）が従来どおり動くこと
3. `read_console_messages` でエラーがないこと
4. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 5: Commit**

```bash
git add js/views/settings.js
git commit -m "feat: add crew sign-in controls to settings"
```

---

### Task 6: PWAキャッシュの更新と全体動作確認

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: ASSETS を実ファイルと突き合わせる**

次のコマンドで差分がないことを確認する（出力が空になること）:

```bash
diff <(find js -name '*.js' | sort) <(grep -o "js/[A-Za-z0-9/_-]*\.js" sw.js | sort -u)
```

差分があれば `ASSETS` を修正する。特に `js/lib/plans.js`、`js/lib/crew.js`、`js/lib/firebase-config.js`、`js/views/plan-editor.js` が含まれること。

- [ ] **Step 2: cache version を上げる**

`sw.js` の1行目 `const CACHE = 'gachi-fit-v23';` を `const CACHE = 'gachi-fit-v24';` に変更する。

- [ ] **Step 3: 全体動作確認**

Run: `npm test 2>&1 | tail -10`
Expected: 93件すべてPASS

ブラウザ確認（`python3 -m http.server 8823`、mobile幅）で全4タブを一巡する。**Firebase 未設定の状態で、既存機能が完全に無傷であることの確認が主眼**:
1. ホーム：挨拶カード・コースボタン・カレンダー・日タップでの詳細・推定1RM が従来どおり。「みんなの予定」カードは出ない
2. 記録：種目ヘッダー・セット保存・インターバルバーが従来どおり
3. 分析：履歴・インサイト・ボディの切替
4. 管理：種目・コース・場所・設定の切替。設定に「メンバー共有」カードがあり「共有機能は未設定です。」と出る
5. `read_console_messages` でエラーゼロ
6. 各タブで `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: PWA cache v24 for crew plan sharing"
```

## Self-Review Notes

- **Spec coverage**: ①認証→Task 2（`crew.js`）＋Task 5（UI）、②Firestore構造とルール→Task 2（`firestore.rules`）、③データモデル→Task 3（`savePlan` に渡す形）、④UI→Task 4（カード）＋Task 3（モーダル）、⑤純粋関数とテスト→Task 1、エラーハンドリング→Task 2（SDK失敗時 `null`）・Task 3（保存失敗のモーダル内表示）・Task 5（サインイン失敗）、セキュリティ→Task 4/5 の `escapeHtml` 適用、ファイル構成→全タスク、`sw.js` 追従→Task 2/3 で追加し Task 6 で最終突合。
- **Placeholder scan**: `firebase-config.js` の `'REPLACE_ME'` は意図的なプレースホルダで、`isCrewConfigured()` がこれを検出して機能を安全に無効化する設計の一部。実装者が埋めるべき「未定の仕様」ではない。
- **Type consistency**: `plan` オブジェクトの形（`{id, ownerEmail, ownerName, date, startTime, placeName, note, updatedAt}`）は Task 1 のテスト・Task 2 の `savePlan`・Task 3 のフォーム・Task 4 の描画で一致。`user` の形（`{email, displayName}`）は Task 2 の `watchAuth`・Task 3 の引数・Task 4/5 の利用で一致。`openPlanEditor(plan, user, onDone)` の引数順は Task 3 の定義と Task 4 の呼び出しで一致。
- **既知の制限（意図的）**: Firebase 設定を入れるまで共有機能は休眠する。設定投入後の実動作確認（サインイン、予定の追加・編集・削除、他メンバーからの見え方）はこの計画の範囲外で、Firebase プロジェクト作成後にユーザーが行う。
