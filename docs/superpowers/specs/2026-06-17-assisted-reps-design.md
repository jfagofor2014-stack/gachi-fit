# 補助ありレップ機能 設計書

## ゴール
セット記録に「補助あり」とその回数を追加する。補助回数は総回数(reps)の内訳とし、推定1RMは自力回数（reps − 補助回数）で算出する。

## 前提・制約
- Phase1-3＋記録改善を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- スキーマ拡張は加算的（`sets` に `assistedReps` 追加、既存データは0扱い、DBバージョン変更なし）

## 機能詳細

### 1. 記録フォーム（workout.js）
- 「補助あり」トグルボタンを追加。ON時に補助回数のステッパー（共通部品 `createStepper`、step 1、min 0）を表示、OFF時は非表示で `assistedReps=0`
- 補助回数は `reps` の内訳。保存時に `assistedReps > reps` の場合は警告してブロック
- 保存：`set.assistedReps` を保存し、`set.estimated1RM = estimate1RM(weight, reps - assistedReps)`

### 2. 1RMロジック（calc.js）
- `computePRs(sets)` を更新：各セットの自力回数 `reps - (assistedReps || 0)` で推定1RMを算出
- `estimate1RM` 自体は不変（呼び出し側が自力回数を渡す）
- 既存セット（`assistedReps` 欠損）は0扱いで従来と同じ結果

### 3. 表示
- 「本日のセット」（workout.js）と「履歴」（history.js）：補助があるセットは `8回（補助2）` と併記
- 補助なし（0）のセットは従来表示（`8回` 相当、`× 8`）

### 4. セット編集（set-editor.js）
- 補助ありトグルと補助回数を編集可能に
- 保存時に `assistedReps > reps` をブロックし、`estimated1RM` を自力回数で再計算

### 5. 配信
- Service Worker キャッシュを v6 に更新

## データモデル（変更点）
- `sets`：`{ ..., reps, assistedReps? }`（`assistedReps` 追加、既定0）
- `estimated1RM` は自力回数（reps − assistedReps）で計算した値を保存

## エラーハンドリング
- `assistedReps > reps`：保存・編集をブロックしインライン警告
- トグルOFF時は `assistedReps=0` を保証

## テスト
- `computePRs`：
  - `assistedReps` を引いた自力回数で1RMを算出すること（例：weight100, reps8, assistedReps2 → estimate1RM(100,6)）
  - `assistedReps` 欠損の既存セットは従来通り（reps全体）で算出すること

## スコープ外
- 補助の種類（フォースト/ネガティブ等）の区別
- 補助回数の品質スコアへの反映
