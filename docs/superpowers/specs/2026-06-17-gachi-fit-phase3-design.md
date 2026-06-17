# GACHI-FIT Phase3 設計書

## ゴール
要件定義書の最終フェーズを実装し、GitHub Pages で公開してスマホでも利用可能にする。Gemini による AI インサイト、体形比較写真、大会カウントダウン・目標体重トラッキング、セットパターンのカスタム管理を追加する。

## 前提・制約
- Phase1/2 を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- Gemini は **ユーザー自身の API キー方式**（Voice Journal 踏襲）：設定画面で入力 → `localStorage` 保存 → クライアントから直接 `gemini-2.5-flash` を呼ぶ。キーは各自のブラウザ内のみに保持し、サーバには送らない
- DB スキーマ拡張は加算的（DB_VERSION を 2 に上げ、既存ストアは保持）
- 全パスは相対指定とし、GitHub Pages のサブパス（`/gachi-fit/`）でも動作させる

## 機能詳細

### 1. AI インサイト（Gemini）
- 新規 `js/lib/gemini.js`：
  - `buildInsightPrompt(stats)`（**純粋関数**）：種目別PR・タグ頻度・タグ×スコア相関・直近セット要約を受け取り、日本語のプロンプト文字列を生成
  - `callGemini(prompt, apiKey, { fetchImpl = fetch })`：`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}` に POST し、生成テキストを返す。HTTP エラー時は例外
- インサイトタブに「AIで分析」ボタンを追加。押下で `sensoryLogs`/`sets`/`exercises` を集計 → `buildInsightPrompt` → `callGemini` → 結果カードを表示
- API キー未設定時は「設定でキーを登録してください」と案内。失敗時はエラーメッセージ表示
- 既存のルールベースインサイト（Phase2）はオフラインで常に表示し、AI 分析はその下に追加表示

### 2. 体形比較写真
- 新ストア `photos`：`{ id, date, bodyPart, dataUrl, note }`
- 新規 `js/lib/image.js`：`compressImage(file, maxEdge=1080, quality=0.8)` — `FileReader`＋`Image`＋`canvas` で長辺を縮小し JPEG dataURL を返す（容量対策）。canvas 依存のためブラウザ手動確認
- 「ボディ」タブ（`js/views/body.js`）：
  - 撮影/選択（`<input type="file" accept="image/*" capture="environment">`）→ 部位・メモ入力 → 保存
  - 一覧から 2 枚を選択し**並列比較表示**
  - 部位フィルタ
  - 各写真の削除

### 3. 大会カウントダウン・目標体重
- 新ストア `goals`：`{ id: 'main', competitionDate, targetWeight }`（単一レコード運用、id 固定 `'main'`）
- 新ストア `bodyWeights`：`{ id, date, weight }`
- 新規 `js/lib/countdown.js`：`daysUntil(dateStr, today=new Date())`（**純粋関数**）— 残り日数を整数で返す（当日=0、過去は負）
- ホーム（`home.js`）に「大会まで残り N 日」を大型表示（goals 未設定時は非表示）
- 「ボディ」タブに体重記録フォームと、目標体重との差・推移スパークライン（Phase2 `chart.js` 再利用）

### 4. セットパターンのカスタム管理
- 現在 `exercises.js` でハードコードの `SET_PATTERNS`（通常/ピラミッド/ドロップ/レストポーズ）を IndexedDB 新ストア `setPatterns`（`{ id, name }`）に移行
- 新規 `js/lib/seed.js`：`ensureDefaultSetPatterns(getAllFn, putFn, uidFn)` — `setPatterns` が空ならデフォルト4種を投入（**純粋ロジック**として依存注入でテスト可能）
- 設定タブで追加・編集・削除
- メニュー管理（`exercises.js`）はパターン選択肢を `setPatterns` ストアから動的取得

### 5. タブ再編（モバイル対応）
下部タブが増えるため主要5タブに再編：
- **ホーム / 記録 / ボディ / インサイト / その他**
- 「その他」（`js/views/more.js`）はメニュー一覧：メニュー管理・履歴・振り返り・設定 へ遷移
- `app.js` のルーティングは全ビューを保持（タブに出ないルートも `navigate` で遷移可能）

### 6. GitHub Pages 公開
- 相対パス確認：`index.html` の `<script src="js/app.js">`・`<link href="css/style.css">`・`manifest.json`、`sw.js` の `register('sw.js')` とキャッシュ資産、すべて相対のまま（サブパスで動作）
- `sw.js` のキャッシュ資産に Phase3 新規ファイルを追加し `CACHE` を `gachi-fit-v3` に更新
- 私がコード調整と push を実施。**Pages 有効化はユーザーがリポジトリ Settings → Pages で Source=main/(root) を設定**（手順を案内）。公開 URL は `https://jfagofor2014-stack.github.io/gachi-fit/`

## ファイル構成（新規・変更）
- 新規 `js/lib/gemini.js`：`buildInsightPrompt`, `callGemini`
- 新規 `js/lib/image.js`：`compressImage`
- 新規 `js/lib/countdown.js`：`daysUntil`
- 新規 `js/lib/seed.js`：`ensureDefaultSetPatterns`
- 新規 `js/views/body.js`：体形写真＋体重＋目標
- 新規 `js/views/more.js`：その他メニュー
- 変更 `js/db.js`：DB_VERSION=2、STORES に `photos`/`goals`/`bodyWeights`/`setPatterns` 追加
- 変更 `js/views/insights.js`：AI 分析ボタン
- 変更 `js/views/settings.js`：API キー入力、セットパターン管理、目標（大会日/目標体重）設定
- 変更 `js/views/exercises.js`：パターンをストアから取得
- 変更 `js/views/home.js`：大会カウントダウン
- 変更 `index.html`：タブを5つに再編
- 変更 `js/app.js`：ルート追加（body/more）、起動時に `ensureDefaultSetPatterns`
- 変更 `sw.js`：キャッシュ v3＋新規資産
- 新規テスト：`test/gemini.test.js`, `test/countdown.test.js`, `test/seed.test.js`

## エラーハンドリング
- Gemini：キー未設定・HTTP エラー・ネットワーク失敗をユーザーに明示。既存機能は影響を受けない
- 画像：読み込み失敗時はトースト表示し保存しない。圧縮で過大データを防ぐ
- DB アップグレード：onupgradeneeded で不足ストアのみ作成（既存データ保持）
- 目標/体重：日付・数値の不正入力をブロック

## テスト
- `gemini.js`：`buildInsightPrompt` が主要統計を含む文字列を返すこと、`callGemini` がモック fetch で生成テキストを抽出することをユニットテスト
- `countdown.js`：当日/未来/過去の日数計算をユニットテスト
- `seed.js`：空ストアにデフォルト投入・既存があれば投入しないことをユニットテスト
- 画像圧縮・体形比較UI・カメラ取り込み・AI 実呼び出し・GitHub Pages 動作はブラウザで手動確認

## スコープ外
- AI のストリーミング応答、複数ゴール管理、写真のクラウド同期、サーバ側 API プロキシ
