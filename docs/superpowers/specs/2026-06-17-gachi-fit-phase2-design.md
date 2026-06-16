# GACHI-FIT Phase2 設計書

## ゴール
Phase1 の数値記録に「言葉（メモ＋定型タグ）」を統合し、API 不要のルール解析で傾向を可視化する。履歴 UI を推定1RM推移グラフで磨き込み、データのエクスポート/インポート・ワークアウト単位の振り返り・セット編集/削除を可能にする。Phase3 の Gemini AI インサイトの土台を整える。

## 前提・制約
- Phase1 の構成を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- AI（Gemini）連携は Phase3。Phase2 はすべてローカル・API なしで完結
- 既存データと後方互換：加算的なスキーマ変更のみ（マイグレーション不要）

## 機能詳細

### 1. Sensory メモ＋定型タグ
- 記録ビュー（`workout.js`）のセット入力に以下を追加：
  - **自由メモ** `note`（任意のテキスト入力）
  - **定型タグ** `tags`（複数選択トグル）。プリセット：
    `調子良い` `腹圧抜けた` `フォーム崩れ` `対象筋に効いた` `関節に違和感` `軽く感じた`
- データモデル拡張：`sensoryLogs` に `note: string`（既定 `''`）と `tags: string[]`（既定 `[]`）を追加
- 既存レコードは欠損時に `note=''`, `tags=[]` として扱い後方互換を保つ

### 2. ルール解析（インサイト・タブ新設）
新タブ「インサイト」を追加。`js/lib/insights.js` に純粋ロジックを実装し、`js/views/insights.js` が描画する。

- **タグ頻度**：直近 N=30 件の sensoryLog からタグ出現回数を集計し降順表示
- **タグ×品質スコア相関**：各タグについて「そのタグを含むセットの平均スコア」と「全体平均スコア」を比較。差が閾値（±1.0）を超えるタグを定型文で提示
  - 例：「『腹圧抜けた』のセットは平均スコアが全体より低い傾向です」
- **タグ×推定1RM**：各タグを含むセットの平均推定1RM を全体平均と比較し、同様に提示
- データが少ない（合計 < 5 セット）場合は「データを蓄積中」の案内を表示

### 3. 履歴UIの磨き込み — 推定1RM推移グラフ
- `js/lib/chart.js` に純粋関数 `sparklinePath(values, width, height)` を実装：数値配列から SVG `path` の `d` 文字列を生成（ライブラリ不使用）
- `history.js` で種目別に推定1RMの時系列（古い→新しい順）を折れ線 SVG で描画
- プラトー（停滞）が視覚的に分かるようにする。点が1つの場合は点のみ描画

### 4. データ機能

#### 4-1. エクスポート/インポート
- `db.js` に `exportAll()`：全ストア（exercises/workouts/sets/sensoryLogs）を `{ version, exportedAt, data:{...} }` 形式の JSON オブジェクトで返す
- `db.js` に `importAll(obj)`：JSON を検証し各ストアへ `put`。`version` 不一致や必須キー欠損は例外を投げる
- 設定ビュー（`settings.js`）から「エクスポート」（Blob ダウンロード）「インポート」（file input → 確認 → 反映）を操作

#### 4-2. ワークアウト単位の振り返り
- `history.js` に「日付別」表示を追加：同一 `workoutId` のセットをまとめ、ワークアウトの `note` を追記・保存できる
- 表示は種目別グラフと日付別リストの2セクション構成

#### 4-3. セットの編集・削除
- 振り返り内の各セットに「編集」「削除」を追加
- 編集：重量/回数/Sensory（core/load/rom）/メモ/タグを修正 → `estimated1RM` と `score` を再計算して `put`
- 削除：`sets` と対応する `sensoryLogs` を `remove`
- 変更後は PR・グラフ・インサイトに即反映（再描画）

## ファイル構成（新規・変更）
- 変更 `js/db.js`：`exportAll` / `importAll` 追加
- 新規 `js/lib/insights.js`：`tagFrequency` / `tagScoreCorrelation` / `tag1RMCorrelation`（純粋関数）
- 新規 `js/lib/chart.js`：`sparklinePath`（純粋関数）
- 変更 `js/views/workout.js`：メモ＋タグ入力
- 変更 `js/views/history.js`：1RM推移グラフ＋日付別振り返り＋編集/削除
- 新規 `js/views/insights.js`：インサイト描画
- 新規 `js/views/settings.js`：エクスポート/インポート
- 変更 `index.html`：タブに「インサイト」「設定」追加
- 変更 `js/app.js`：ルート登録
- 変更 `sw.js`：新規ファイルをキャッシュ資産に追加
- 新規 `test/insights.test.js`, `test/chart.test.js`：純粋ロジックのユニットテスト

## エラーハンドリング
- インポート：不正 JSON・version 不一致・必須キー欠損は処理せずトースト/インライン警告。既存データは破壊しない
- 編集保存：数値未入力/不正値はブロックしインライン警告（Phase1 と同様の検証）
- 空状態：各ビューでデータ不足時に案内文を表示

## テスト
- `insights.js`：タグ頻度集計、相関の閾値判定、空データの扱いをユニットテスト
- `chart.js`：1点/複数点/同値配列での path 生成をユニットテスト
- IndexedDB/UI 統合（export/import、編集/削除、グラフ描画）はブラウザで手動確認

## スコープ外（Phase3）
- Gemini による自然言語インサイト・自由メモの意味解析
- 体形比較・大会カウントダウン・目標体重トラッキング
