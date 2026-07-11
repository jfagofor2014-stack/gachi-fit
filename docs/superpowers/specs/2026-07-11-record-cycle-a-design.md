# 記録改善サイクルA 設計書

## ゴール
6件の改善要望のうち、記録フォーム基盤に関わる5件を先行実装する：①種目単位のまとめ保存（最大6行）、③インターバル終了10秒前の音、④種目プリセット＋キーワード検索、⑤タグ機能の全廃、⑥重量ステッパーを0.5kg刻みに。②スーパーセットは別サイクルで、まとめ保存の土台の上に実装する。

## 前提・制約
- Phase1-3＋各改善を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- 加算的スキーマ変更（DBバージョン変更なし）。`sensoryLogs` から `tags` フィールドを廃止（今後書き込まない。既存データの `tags` は単に無視）
- 既存 `getAll`/`put`/`remove`/`uid`、`createStepper`、`estimate1RM`、`computePRs`、`categoryKey` 等に準拠

## 機能詳細

### ① まとめ保存（種目選択→最大6行→まとめ保存）
- 記録タブの「セット記録」カードを刷新：
  - 種目選択は現状どおり単一（カードの外、上部で選択）
  - 行（デフォルト3、最小1、最大6）：各行に重量・回数・補助回数ステッパー＋推定1RM表示
  - 「＋ 行を追加」「− 行を削除」（末尾の行を対象、シンプルさのため個別行削除はしない）
  - メモ欄は**行ごとではなくバッチ全体で1つ**（記録の粒度を保ちつつUIを単純化）
  - 「まとめて記録」ボタンで、入力済み（重量>0 かつ 回数>0）の行だけをまとめて `sets`＋`sensoryLogs`（note のみ）として保存。空行はスキップ
  - 保存後は行を初期状態（3行・空）にリセットし、「本日のセット」とボリュームバーを更新
  - 補助回数 > 回数の行があれば保存をブロックしエラー表示
  - 全行が空なら「少なくとも1セット入力してください」

### ③ インターバル終了10秒前に音
- 新規 `js/lib/sound.js`：
  - `shouldBeep(remaining, thresholdSec = 10)` — 純粋関数、`remaining === thresholdSec` を返す（テスト対象）
  - `playBeep({frequency, durationMs})` — Web Audio API でビープ音を1回再生（外部音声ファイル不要、ブラウザ専用・テスト対象外）
- 記録タブのインターバルタイマー `onTick` 内で `shouldBeep(remaining)` が真なら `playBeep()` を呼ぶ

### ④ 種目プリセット＋キーワード検索
- 新規 `js/lib/exercisePresets.js`：
  - `DEFAULT_EXERCISE_PRESETS`：主要種目（胸/背中/肩/脚/腕/体幹の代表種目、各 `{name, bodyPart, category}`）約25件
  - `searchPresets(query, presets = DEFAULT_EXERCISE_PRESETS)` — name/bodyPart部分一致（大小無視）の純粋関数（テスト対象）
- メニュー管理（exercises.js）の種目追加フォームに「プリセット検索」入力を追加。入力に応じて候補をチップ表示、タップで 種目名／部位／主要部位 を自動入力（追加ボタンは押さず、ユーザーが確認して保存）

### ⑤ タグ機能の全廃
- 記録フォーム・セット編集モーダルから定型タグUIを削除
- `sensoryLogs` は `{ id, setId, note }` のみ（tags を書き込まない）
- インサイト画面から「よく使うタグ」「タグ × 推定1RM」カードを削除。**AI分析のみ**残す（PR・感想から生成、5セット未満の足切りは廃止しシンプルに「記録なし」判定のみに）
- `js/lib/insights.js`（タグ集計ロジック）と `test/insights.test.js` を削除（全内容がタグ前提のため）
- `js/lib/gemini.js` の `buildInsightPrompt` から「よく使うタグ」セクションを削除
- `js/lib/obsidian.js` の Markdown 生成からタグの付記を削除（メモは残す）
- `js/views/home.js` の `buildDayData` からタグ受け渡しを削除

### ⑥ 重量ステッパーを0.5kg刻みに
- `js/views/workout.js`（新しい行UI）・`js/views/set-editor.js` の重量 `createStepper` の `step` を `2.5` → `0.5` に変更

## ファイル構成（新規・変更・削除）
- 新規 `js/lib/sound.js`、`js/lib/exercisePresets.js`
- 変更 `js/views/workout.js`（大幅書き換え：行UI・ビープ・0.5kg・タグ削除）
- 変更 `js/views/set-editor.js`（タグ削除・0.5kg）
- 変更 `js/views/exercises.js`（プリセット検索）
- 変更 `js/views/insights.js`（タグカード削除、AIのみ）
- 変更 `js/views/home.js`（buildDayDataからtags除去）
- 変更 `js/lib/gemini.js`、`js/lib/obsidian.js`（タグ節除去）
- 削除 `js/lib/insights.js`、`test/insights.test.js`
- 変更 `sw.js`（キャッシュ更新、insights.js削除・新規lib追加）
- 変更テスト：`test/gemini.test.js`、`test/obsidian.test.js`（タグ関連の記述を削除・更新）
- 新規テスト：`test/sound.test.js`、`test/exercisePresets.test.js`

## エラーハンドリング
- まとめ保存：空行のみはエラー、補助>回数はブロック（行番号までは特定しない簡易メッセージ）
- プリセット検索：該当なしは「候補がありません」

## テスト
- `sound.js`：`shouldBeep` の閾値一致・不一致
- `exercisePresets.js`：`searchPresets` の部分一致（大小無視）・空クエリで空配列
- `gemini.js`：タグ節が無くなったプロンプトで PR/感想が含まれることを検証するようテスト更新
- `obsidian.js`：タグ抜きの Markdown 生成をテスト更新
- 行UI・ビープ再生・プリセット選択・タグUI削除・0.5kg刻みはブラウザで手動確認

## スコープ外（次サイクル）
- ②スーパーセット（別サイクルB）
