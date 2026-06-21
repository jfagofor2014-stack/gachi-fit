# 記録タブ改善 設計書

## ゴール
テストユーザーのフィードバックに先立ち、記録タブの操作性を改善する。重量・回数のステッパー化、セット記録とインターバルの分離、本日のセットからの修正、トレーニング時間・場所の記録、本日の感想入力（AI分析対象）を追加する。

## 前提・制約
- Phase1〜3 を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- DB スキーマ拡張は加算的（DB_VERSION を 3 に上げ、既存データは保持）
- 設定値（既定インターバル秒数）は localStorage に保存（Gemini キーと同方式）

## 機能詳細

### 1. 重量・回数のステッパー化
- 記録タブの重量・回数入力を `[−] 値 [＋]` のステッパーに変更
- 中央の数値は `<input type="number">` のままで直接入力も可能、両脇に −/＋ ボタン
- 刻み幅：重量 `2.5`（kg）、回数 `1`、いずれも下限 0
- 新規 `js/views/components.js` に `createStepper(container, { value, step, min, onChange })` を実装し、記録タブとセット編集モーダルで共通利用（DRY）
- ステッパーは DOM 部品のためユニットテストせず、ブラウザで確認

### 2. セット記録とインターバルの分離
- 「セット記録 + インターバル開始」ボタンを **「セット記録」**（保存のみ、タイマー起動しない）に変更
- 独立した **「インターバル」カード**を常設：
  - 秒数チップ（60 / 90 / 120 / 180 秒）。起動時は既定秒数（設定値、初期90）が選択済み
  - **「開始」** ボタンでカウントダウン開始、**「停止」** ボタンで停止
  - タイマー表示は既存 `timer.js`（`createTimer`/`formatTime`）を流用
- セット記録とインターバルは完全独立（どちらを先に押してもよい）

### 3. 「本日のセット」から編集・削除
- 本日のセット各行に **編集／削除** ボタンを追加
- セット編集モーダルを `review.js` から **`js/views/set-editor.js`** に切り出し、`openSetEditor(setId, onDone)` として記録タブ・振り返りタブ双方から呼ぶ（重複排除）
- 編集後・削除後は本日のセット一覧と PR を再描画
- `review.js` は新モジュールを使うよう変更（挙動不変）

### 4. トレーニング時間＋場所
- **場所**：新ストア `places`（`{ id, name }`）
  - 「その他 → メニュー管理」（`exercises.js`）に場所の追加・編集・削除セクションを追加
  - 記録タブ上部で「今日の場所」をセレクトで選択 → その日のワークアウトの `placeId` に保存
- **トレーニング時間**：記録タブに「トレーニング時間」カード
  - **「開始」**：ワークアウトの `startedAt`（ミリ秒）を保存し、経過時間を毎秒表示
  - **「終了」**：経過秒を `durationSec` に保存しタイマー停止
  - 経過/保存済み時間の下に **手動入力（分）** 欄を置き、保存で `durationSec` を上書き（自動＋手動の両対応）
- ワークアウトに `placeId` / `durationSec` / `startedAt` を追加（加算的、既存データは欠損として扱う）
- 経過秒→「M分」表示の整形は純粋関数 `formatMinutes(sec)` を `js/lib/duration.js` に実装しユニットテスト

### 5. 本日の感想入力（AI分析対象）
- 記録タブに「本日の感想」テキスト入力を追加 → その日のワークアウトの `note` に保存
- `gemini.js` の `buildInsightPrompt(stats)` に `stats.workoutNotes`（最近の感想テキスト配列）を追加し、プロンプトに「【最近の感想】」セクションを含める
- `insights.js` の AI 分析で直近ワークアウトの `note` を集めて渡す

### 6. 設定：既定インターバル秒数
- 「その他 → 設定」に「既定インターバル秒数」入力を追加 → localStorage キー `default_interval_sec`（初期値 90）に保存
- 記録タブのインターバルカードはこの値を初期選択に使う

## ファイル構成（新規・変更）
- 新規 `js/lib/duration.js`：`formatMinutes(sec)`（純粋関数）
- 新規 `js/views/components.js`：`createStepper(container, opts)`
- 新規 `js/views/set-editor.js`：`openSetEditor(setId, onDone)`（review.js から抽出）
- 変更 `js/db.js`：DB_VERSION=3、STORES に `places` 追加
- 変更 `js/views/workout.js`：ステッパー・インターバル分離・本日セット編集・時間/場所/感想
- 変更 `js/views/review.js`：set-editor 利用に変更
- 変更 `js/views/exercises.js`：場所管理セクション追加
- 変更 `js/views/settings.js`：既定インターバル秒数設定
- 変更 `js/lib/gemini.js`：`buildInsightPrompt` に感想を追加
- 変更 `js/views/insights.js`：AI 分析に感想を渡す
- 変更 `sw.js`：キャッシュ v4＋新規資産
- 新規テスト：`test/duration.test.js`、`test/gemini.test.js` に感想ケース追加

## データモデル（変更点）
- `workouts`：`{ id, date, note, placeId?, durationSec?, startedAt? }`（後方3つを追加）
- `places`（新）：`{ id, name }`

## エラーハンドリング
- ステッパー：下限 0 を下回らない。手入力の不正値は 0 扱い
- トレーニング時間：手動入力は数値のみ受け付け、未開始でも手動保存可
- 既定秒数：1〜600 の範囲外は無視し従来値を維持
- DB アップグレード：onupgradeneeded で不足ストアのみ作成（既存データ保持）

## テスト
- `duration.js`：0秒/59秒/60秒/3600秒の分表示をユニットテスト
- `gemini.js`：`buildInsightPrompt` が感想テキストを含むことをユニットテスト
- ステッパー・インターバル分離・本日セット編集・時間/場所/感想・設定はブラウザで手動確認

## スコープ外
- 種目ごとの場所変更（場所はワークアウト単位）
- インターバルの自動連鎖（セット保存と連動した自動開始）
- 複数ワークアウトの同日並行管理
