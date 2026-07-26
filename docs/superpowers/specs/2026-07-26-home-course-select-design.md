# ホーム画面からのコース選択・AI提案 設計書

## ゴール
ホーム画面の「お帰りなさい」カードから、①登録済みコースを選んで記録タブへ進める、②AIが登録種目の中から今日のコースを提案し、そのまま記録に進むか、コースとして保存できるようにする。

## 前提・調査結果
- コース機能の土台（`courses`ストア、`js/lib/courses.js`の`mostUsedExerciseIds`、`exercises.js`のコース作成UI、`workout.js`のコース選択→種目タップ）は実装済み（SW v20時点）
- `js/views/home.js`には既存の部位提案カード（`suggestBodyParts`ベース）がある。今回これを置き換える
- `js/lib/gemini.js`に`buildInsightPrompt`/`callGemini`の既存パターンがある。APIキーは`localStorage.getItem('gemini_api_key')`
- `js/views/workout.js`の`renderWorkout(el, navigate, opts)`は既に`opts.initialPart`に対応済み。コース選択時の種目ボタン表示ロジック（`renderCourseExercises`、種目タップで`#w-ex`をセットしPR/ボリューム更新）がある

## 機能詳細

### ① ホーム画面のコースカード（`js/views/home.js`）
既存の部位提案カードを置き換え、以下を1枚のカードにまとめる：
- 見出し「お帰りなさい。今日はどんなトレーニングをしますか？」
- 登録済みコースのボタン一覧（`getAll('courses')`）。タップで `navigate('workout', { initialCourseId: course.id })`
- コース未登録なら案内文のみ（「メニュー管理でコースを登録すると、ここから選べます」）
- 「AIが今日のコースを提案」ボタン
- AI提案結果表示エリア（初期は空）：
  - 提案された種目名のリスト
  - 「コース名」テキスト入力（デフォルト値: `AIおすすめ ${M}/${D}`）
  - 「この内容で記録する」ボタン → `navigate('workout', { initialExerciseIds: matchedIds })`
  - 「この内容でコース保存」ボタン → `courses`ストアに`{id, name, exerciseIds: matchedIds}`を保存し、保存完了メッセージを表示

### ② AIプロンプト・パース（`js/lib/gemini.js` 追加）
- `buildCourseSuggestionPrompt({ exercises, gaps })`（純粋関数）
  - `exercises`: `[{name, bodyPart}]`（登録済み全種目）
  - `gaps`: `[{category, days}]`（部位ごとの最終トレーニングからの経過日数。未経験は`null`扱いで「未実施」と表記）
  - プロンプトは「与えられた種目名の中から3〜6種目を選び、部位のバランスと回復日数を考慮して today のコースを組み、`{"exercises": ["種目名", ...]}` の JSON のみを出力してください（説明文やコードフェンスは不要）」という指示を含む
- `parseCourseSuggestion(text)`（純粋関数）
  - 応答テキストから```json等のコードフェンスを除去し`JSON.parse`
  - `exercises`配列（文字列配列）を返す。パース失敗・`exercises`が配列でない場合は`[]`を返す

### ③ 種目名→ID照合（`js/lib/courses.js` 追加）
- `matchExerciseNamesToIds(names, exercises)`（純粋関数）
  - `names`（AIが返した種目名配列）を`exercises`の`name`と完全一致でIDに変換
  - 順序は`names`の順を維持、未一致はスキップ、重複IDは除去

### ④ `workout.js` の拡張
- `renderWorkout(el, navigate, opts)`に`opts.initialExerciseIds`（配列）を追加
- 既存のコース選択→種目ボタン表示ロジック（`renderCourseExercises`内の「ボタン一覧を作り、タップで部位/種目セレクトを切り替えPR・ボリューム更新」部分）を共通関数`showExerciseButtons(ids)`として切り出す
  - `#w-course`の`change`イベントは選択コースの`exerciseIds`を`showExerciseButtons`に渡す
  - 初回レンダー時、`opts.initialExerciseIds`が有効なID配列であれば`showExerciseButtons(opts.initialExerciseIds)`を呼ぶ（`#w-course`は「選択なし」のまま＝保存済みコースと連動させない）
  - `opts.initialCourseId`が有効なコースIDであれば、`#w-course`の初期値をそのIDにし、`showExerciseButtons(course.exerciseIds)`を呼ぶ

### ホーム画面側のAI呼び出しフロー
1. ボタン押下時、`exercises`と`gaps`（`lastTrainedDateByCategory`から算出）を組み立て`buildCourseSuggestionPrompt`でプロンプト生成
2. `callGemini`実行中は「提案中…」を表示
3. 応答を`parseCourseSuggestion`でパース→`matchExerciseNamesToIds`でID化
4. マッチ0件ならエラー表示、1件以上あれば提案結果エリアを表示

## エラーハンドリング
- Gemini APIキー未設定：「設定でGemini APIキーを登録してください。」
- API呼び出し失敗：「エラー: <メッセージ>」
- 応答の解析結果が0件（パース失敗 or マッチなし）：「AIの提案を解析できませんでした。もう一度お試しください。」
- コース保存時、コース名が空なら保存せずエラー表示（既存のコース保存と同じ方針）

## ファイル構成（新規・変更）
- 変更 `js/lib/gemini.js`：`buildCourseSuggestionPrompt`、`parseCourseSuggestion`を追加
- 変更 `js/lib/courses.js`：`matchExerciseNamesToIds`を追加
- 変更 `js/views/home.js`：部位提案カードをコース選択＋AI提案カードに置き換え
- 変更 `js/views/workout.js`：`opts.initialExerciseIds`対応、`showExerciseButtons`への切り出し
- 変更テスト：`test/gemini.test.js`、`test/courses.test.js`

## テスト
- `buildCourseSuggestionPrompt`：exercises/gapsが渡された内容通りプロンプト文字列に含まれること
- `parseCourseSuggestion`：素のJSON／コードフェンス付きJSON／不正テキストの3パターン
- `matchExerciseNamesToIds`：全一致、一部不一致、重複名の除去、空配列
- ビュー層は手動確認：
  - ホームでコースボタンをタップ→記録タブでそのコースが選択済み・種目ボタン表示される
  - ホームで「AIが今日のコースを提案」→種目一覧とコース名入力が表示される→「この内容で記録する」→記録タブで種目ボタンが表示されタップで選択できる→「この内容でコース保存」→メニュー管理のコース一覧に追加されている
  - APIキー未設定時にエラーメッセージが出る

## スコープ外（次サイクル）
- コース実施の進捗表示（実施済み種目のチェックなど）
- AI提案の自動再生成・複数案の比較
