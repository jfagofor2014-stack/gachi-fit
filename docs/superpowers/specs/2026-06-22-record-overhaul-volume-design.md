# 記録タブ刷新＋部位別ボリューム 設計書

## ゴール
記録タブを簡素化し（時間は開始〜終了の手入力で自動算出、感覚3項目とスコアを廃止、保存フィードバック追加）、部位別の過去最高ボリュームを可視化して「超える」目標を持てるようにする。

## 前提・制約
- Phase1-3＋各改善を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- 加算的なスキーマ変更（DBバージョン変更なし）。既存データの欠損は安全に扱う
- 既存 `get`/`getAll`/`put`/`remove`/`uid`、`localDateStr`、`createStepper` に準拠

## 機能詳細

### 1. トレーニング時間（開始〜終了の手入力）
- 記録タブ最上部「本日のトレーニング」カードの時間UIを変更：開始/終了ボタンと手動分入力を廃止し、**開始時刻・終了時刻（`<input type="time">`）**を配置
- いずれか変更時に所要時間を自動算出して表示・保存
- `workout` に `startTime`/`endTime`（"HH:MM"）と `durationSec` を保存
- 純粋関数 `durationMinutes(start, end)`：`'HH:MM'` 2つから分を返す。終了≤開始・空文字は0

### 2. 感覚記録の簡素化
- 記録フォーム・編集モーダルから **腹圧保持・対象筋への負荷・可動域(ROM)** を削除
- **品質スコア(Q)** と **「タグ×品質スコア」インサイト**を廃止
- `sensoryLogs` を `{ id, setId, note, tags }` に簡素化（保存時に core/muscleLoad/rom/score を書かない）
- 表示から「Q」を削除：本日のセット（workout.js）・履歴（history.js）・ホーム日詳細（home.js）・振り返り（review.js）
- `js/lib/calc.js` から `sensoryScore` を削除、`test/calc.test.js` の該当テスト削除
- `js/lib/insights.js` から `tagScoreCorrelation` を削除、`test/insights.test.js` の該当テスト削除。`insights.js` ビューはタグ頻度・タグ×1RM・AIのみ
- `js/lib/gemini.js` の `buildInsightPrompt` から `scoreCorr` セクションを削除、`test/gemini.test.js` を更新。`insights.js` ビューの AI 統計から `scoreCorr` を除去
- set-editor.js は重量・回数・補助・タグ・メモのみ編集

### 3. 保存フィードバック
- 「セット記録」押下・保存成功後、ボタン文言を一時的に「保存しました」に変えて1.5秒後に戻す（感想保存と同方式）

### 4. 部位別 最高ボリューム
- **主要部位**：固定リスト `['背中', '胸', '肩', '脚', '腕', 'その他']`
- メニュー管理（exercises.js）の種目追加フォームに「主要部位」セレクトを追加し、`exercise.category` に保存。既存の自由入力 `bodyPart` は細分として併存。`category` 未設定は集計時 `'その他'` 扱い
- **ボリューム計算**（純粋関数 `setVolume(weight, reps, assistedReps)`）：
  - 自力回数 `selfReps = reps - assistedReps`
  - 補助分は重量を半減ずつ累積：係数 `1 - 0.5^assistedReps`
  - `volume = weight * (selfReps + (1 - Math.pow(0.5, assistedReps)))`
  - 例：100kg×8・補助2 → 100×(6 + 0.75) = 675
- **部位×日合計**：`categoryVolumeForDate(sets, exById, wkById, date)` → `{ category: 合計volume }`
- **過去最高**：`maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate)` → `{ category: 日合計の最大 }`（excludeDate の日を除外）
- 可視化：
  - **記録タブ**：選択中の種目の `category` について「本日合計 / 過去最高」をバー＋数値表示。本日合計が過去最高を超えたら「自己ベスト更新！」。セット保存後に再計算・更新
  - **ホーム**：部位別の過去最高ボリューム一覧（バー＋数値）。データのある部位のみ
- バーは既存スタイルに合わせた `<div>` 幅%で表現（本日/過去最高の比率）

## ファイル構成（新規・変更）
- 新規 `js/lib/volume.js`：`setVolume`, `categoryVolumeForDate`, `maxCategoryVolumeExcludingDate`
- 新規 `js/lib/timerange.js`：`durationMinutes(start, end)`
- 変更 `js/lib/calc.js`：`sensoryScore` 削除
- 変更 `js/lib/insights.js`：`tagScoreCorrelation` 削除
- 変更 `js/lib/gemini.js`：プロンプトから scoreCorr 除去
- 変更 `js/views/workout.js`：時間UI・感覚3項目削除・保存フィードバック・部位ボリュームバー
- 変更 `js/views/set-editor.js`：感覚3項目削除
- 変更 `js/views/exercises.js`：主要部位セレクト追加
- 変更 `js/views/history.js`：Q表示削除
- 変更 `js/views/home.js`：Q表示削除＋部位別最高ボリューム一覧
- 変更 `js/views/insights.js`：scoreCorr 関連削除
- 変更 `js/views/review.js`：Q表示削除（編集は set-editor 経由で対応済み）
- 変更 `css/style.css`：ボリュームバーのスタイル
- 変更 `sw.js`：キャッシュ v10、新規 lib 追加
- 新規テスト：`test/volume.test.js`、`test/timerange.test.js`、既存テスト更新（calc/insights/gemini）

## データモデル（変更点）
- `exercises`：`{ ..., bodyPart, category? }`（`category` 追加）
- `workouts`：`{ ..., startTime?, endTime?, durationSec? }`
- `sensoryLogs`：`{ id, setId, note, tags }`（core/muscleLoad/rom/score を廃止）

## エラーハンドリング
- 時間：終了≤開始・未入力は所要時間0、保存はブロックしない
- ボリューム：過去最高が無い部位は「過去最高 —」、本日合計があれば常に更新扱い
- 既存 sensoryLog の欠損フィールドは無視（後方互換）

## テスト
- `timerange.js`：`durationMinutes('09:00','10:30')===90`、終了≤開始や空は0
- `volume.js`：
  - `setVolume(100,8,0)===800`、`setVolume(100,8,2)===675`、`setVolume(100,5,5)===100*(0+ (1-0.5**5))`
  - `categoryVolumeForDate`：日付×部位の合計、`maxCategoryVolumeExcludingDate`：指定日除外の最大
- UI（時間入力・感覚削除・保存表示・バー）はブラウザで手動確認

## スコープ外
- 部位別ボリュームの時系列グラフ、種目別ボリューム
- 補助種別の区別、品質スコアの代替指標
