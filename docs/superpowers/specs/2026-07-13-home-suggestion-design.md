# ホーム画面の挨拶＋部位提案 設計書

## ゴール
ホーム画面のカレンダー上部に「お帰りなさい。今日はどんなトレーニングをしますか？」という挨拶と、直近しばらく鍛えていない部位2つを提案するカードを表示する。提案部位をタップすると、記録タブにその部位が選択された状態で移動できる。

## 前提・調査結果
- `js/app.js` の `navigate(route)` は各ビューを `render(el, navigate)` の形で呼び出す（`js/views/more.js` の `renderMore(el, navigate)` がすでにこの `navigate` 引数を使ってタブ遷移している）
- `js/views/workout.js`（前サイクルで実装済み）は、登録済み種目がある部位を `BODY_PARTS` 順→それ以外の順で並べ、部位セグメントボタン→絞り込み種目セレクトの2段選択を持つ。部位の抽出ロジック（`exPartGroups`/`exParts`の構築）は現在 `workout.js` 内にインライン実装されている
- `js/lib/volume.js` の `categoryKey(ex)` で種目→部位のマッピングを取得できる
- `js/lib/countdown.js` の `daysUntil(dateStr, today)` は対象日までの残り日数（当日=0、過去は負）を返す純粋関数。これを使えば「経過日数 = -daysUntil(lastDate, today)」で算出できる

## 機能詳細

### ① 部位抽出ロジックの共通化（`js/lib/volume.js`）
- 新規 `categoriesWithExercises(exercises, bodyParts)`：種目が1件以上ある部位を `bodyParts`（`BODY_PARTS`）順→それ以外の順で返す純粋関数
- `js/views/workout.js` の既存インライン抽出ロジック（`exParts` の算出部分）をこの関数の呼び出しに置き換える（`exPartGroups`自体の構築はworkout.js側に残す。種目セレクトの絞り込みに必要なため）

### ② 部位提案ロジック（新規 `js/lib/suggest.js`）
- `lastTrainedDateByCategory(sets, exById, wkById)`：部位ごとの最終トレーニング日（`'YYYY-MM-DD'`）を返す純粋関数。記録がない部位はキーなし
- `suggestBodyParts(categories, lastTrainedByCategory, today, count=2)`：`categories`から「その他」を除いたものを対象に、`daysUntil`を使って経過日数を算出（記録がなければ最優先＝`Infinity`扱い）し、経過日数が長い順に`count`件を返す純粋関数。同点はcategoriesの並び順を維持（安定ソート）

### ③ ホーム画面への組み込み（`js/views/home.js`）
- `renderHome(el, navigate)` の第2引数を受け取るようシグネチャを変更
- カレンダーカードの直前に、挨拶文「お帰りなさい。今日はどんなトレーニングをしますか？」と、`categoriesWithExercises`→`lastTrainedDateByCategory`→`suggestBodyParts`で算出した2部位をボタンとして並べたカードを常に表示
- 部位ボタンをタップすると `navigate('workout', { initialPart: 部位名 })` を呼ぶ
- 種目が1件も登録されていない場合は提案カード自体を表示しない（記録タブ側の既存の「先に種目を登録してください」表示と同じ考え方）

### ④ 記録タブとのナビゲーション連携（`js/app.js` / `js/views/workout.js`）
- `js/app.js` の `navigate(route, opts)` を、`opts`を受け取って `render(el, navigate, opts)` に渡すよう拡張
- `js/views/workout.js` の `renderWorkout(el, navigate, opts = {})` が `opts.initialPart` を受け取り、`categoriesWithExercises`で算出した部位一覧に含まれていれば、その部位を初期選択状態にする（含まれていなければ現状どおり先頭の部位を選択）

## ファイル構成（新規・変更）
- 新規 `js/lib/suggest.js`：`lastTrainedDateByCategory`・`suggestBodyParts`
- 変更 `js/lib/volume.js`：`categoriesWithExercises` を追加
- 変更 `js/views/workout.js`：部位抽出ロジックを`categoriesWithExercises`呼び出しに置き換え、`renderWorkout`が`(el, navigate, opts)`を受け取り`opts.initialPart`に対応
- 変更 `js/views/home.js`：挨拶＋提案カードを追加、`renderHome(el, navigate)`に変更
- 変更 `js/app.js`：`navigate(route, opts)`が`opts`を描画関数に渡すよう変更
- 新規テスト：`test/suggest.test.js`
- 変更テスト：`test/volume.test.js`（`categoriesWithExercises`のテスト追加）

## エラーハンドリング
- 種目が0件の場合、提案カードを表示しない（既存の記録タブの「先に種目を登録」パターンと同様）
- `opts.initialPart` が現在の部位一覧に存在しない場合は無視し、既存どおり先頭の部位を選択

## テスト
- `suggest.js`：
  - `lastTrainedDateByCategory`：複数部位・複数日のセットから、各部位の最終日が正しく算出されること
  - `suggestBodyParts`：経過日数が長い部位が優先されること、記録が一度もない部位が最優先されること、「その他」が除外されること、`count`件だけ返ること、同点の場合は入力順が保たれること
- `volume.js`：`categoriesWithExercises`が`BODY_PARTS`順→それ以外の順で、種目がある部位だけを返すこと
- `home.js`/`workout.js`/`app.js`はビュー層のため既存方針どおりユニットテスト対象外。ブラウザで以下を手動確認：
  - ホーム画面のカレンダー上部に挨拶＋2部位の提案が表示される
  - 直近鍛えていない部位（または未記録の部位）が優先的に提案されていること
  - 提案部位をタップ→記録タブに移動し、その部位が選択された状態で種目セレクトが絞り込まれていること
  - 種目未登録の状態ではホームに提案カードが表示されないこと
