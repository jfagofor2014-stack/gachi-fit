# 記録まわりの使い勝手改善（コースプリセット・入力・視認性） 設計書

## ゴール

ジムで実際に使ううえで手数と迷いを減らす4点を改善する。コースをゼロから組まなくても使えるようにし、数値入力から不要な操作を省き、開閉の矢印と休憩タイマーを指と目に合うサイズにする。

## 前提・調査結果

- `js/lib/exercisePresets.js` に `DEFAULT_EXERCISE_PRESETS`（28件、部位別に 胸5 / 脚7 / 背中6 / 肩4 / 腕4 / その他2）と `searchPresets` がある
- `js/lib/seed.js` の `ensureDefaultSetPatterns` が「ストアが空ならデフォルト投入」の既存パターン（依存注入でテスト可能）
- `js/lib/courses.js` に `mostUsedExerciseIds` と `matchExerciseNamesToIds(names, exercises)` がある
- `js/lib/constants.js` に `COURSE_MIN_EX = 3` / `COURSE_MAX_EX = 6`
- `courses` ストアは `{id, name, exerciseIds}`。`exerciseIds` は各端末の `uid()` で振られた種目IDを参照する
- `js/views/components.js` の `createStepper` は `value = 0` を既定とし `<input value="0">` を描画する。`read()` は `parseFloat` が NaN のとき 0 を返すため、入力欄が空でも 0 として読める
- `createStepper` の利用箇所は8つ（`js/views/set-editor.js` に3、`js/views/workout/set-entry.js` に5）
- 矢印は2種類。`css/style.css` の `.fold > summary::after`（`content: '▸'`、font-size 14px、色 `--muted`）と、`js/views/workout/exercise-panel.js` の `<span class="muted" id="w-ex-caret">▾</span>`（クラスなし＝本文サイズ）
- `.interval-bar` は padding 10px/12px、`.interval-btn` が min-height 44px、`.interval-time` が 22px。実測でバー高さ66px。`body.has-interval-bar` の下余白は `calc(148px + env(safe-area-inset-bottom))`

## ① コースプリセット

### データ

新規 `js/lib/coursePresets.js` に6コースを定義する。すべての種目名は `DEFAULT_EXERCISE_PRESETS` に実在し、種目数は `COURSE_MIN_EX`〜`COURSE_MAX_EX` に収まる。

| コース名 | 種目 |
|---|---|
| 胸・肩 | ベンチプレス / インクラインベンチプレス / ダンベルフライ / ショルダープレス / サイドレイズ |
| 背中・腕 | デッドリフト / ラットプルダウン / ベントオーバーロウ / バーベルカール / ケーブルプッシュダウン |
| 脚 | スクワット / レッグプレス / レッグエクステンション / レッグカール / カーフレイズ |
| 胸のみ | ベンチプレス / インクラインベンチプレス / ダンベルフライ / ディップス |
| プッシュ | ベンチプレス / ショルダープレス / サイドレイズ / ケーブルプッシュダウン |
| プル | 懸垂 / ラットプルダウン / シーテッドロウ / バーベルカール |

### 動作

コースは種目IDの配列を参照するため、プリセットを実体化するにはその種目が登録済みである必要がある。**未登録の種目は `DEFAULT_EXERCISE_PRESETS` から自動的に登録してからコースを作る。** 自動登録は副作用なので、何が追加されたかを必ず画面に明示する。

管理タブ→コースの「コース」カードに「プリセットから作成」セクションを追加し、6つのプリセット名をチップとして並べる。チップをタップすると:

1. そのプリセットの種目名のうち、`exercises` ストアに同名がないものを抽出する
2. 抽出した名前を `DEFAULT_EXERCISE_PRESETS` から引き、`{id: uid(), name, bodyPart, category, cuePresets: [], setPattern: '通常'}` として `exercises` に登録する
3. `matchExerciseNamesToIds` で全種目名をIDに変換する
4. `courses` に `{id: uid(), name, exerciseIds}` を保存する
5. 「胸・肩コースを作成しました（種目2件を追加）」と表示する。追加が0件なら「（種目2件を追加）」の部分は出さない
6. コース一覧と種目スロットを再描画する

同名のコースが既にある場合も、重複を許して新規作成する（コース名は一意でなくてよく、既存のコース保存も重複を許している）。

### 純粋関数

`js/lib/coursePresets.js` に `missingExerciseNames(names, exercises)` を置く。`names` のうち `exercises` に同名が存在しないものを、順序を保ち重複を除いて返す。

## ② 数値入力の初期値「0」をなくす

`js/views/components.js` の `createStepper` を変更する。

- 描画時、`value === 0` のときは `value` 属性を空にし、`placeholder="0"` を付ける
- `set(v)` も同様に、`v === 0` のときは空文字を入れる
- `read()` は変更しない（空文字は `parseFloat` が `NaN` になり 0 が返る既存の挙動をそのまま使う）

これにより記録タブの通常・ドロップセット・スーパーセット、セット編集モーダルのすべてのステッパーが、初期状態で空欄になりタップして直接入力できる。`−` で 0 まで下げた場合も空欄になり、プレースホルダの薄い `0` が見える。

保存側のロジック（`rv.weight > 0 && rv.reps > 0` による絞り込み、推定1RM算出、通常モードの重量自動追従、ドロップセットの保存後重量引き継ぎ）はすべて `read()` / `set()` 経由のため変更しない。

## ③ 開閉矢印の視認性

- `css/style.css` の `.fold > summary::after` の `font-size` を 14px → 20px、`color` を `var(--muted)` → `var(--text)` に変更する
- `js/views/workout/exercise-panel.js` の `#w-ex-caret` に新クラス `caret` を付け、`css/style.css` に `.caret { font-size: 20px; color: var(--text); }` を追加する（現在の `class="muted"` は外す）
- タップ領域を広げるため、`.fold > summary` と `.ex-header-main` の `min-height` を 32px → 44px にする

## ④ 休憩タイマーを大きくする

`css/style.css` を変更する。

| 対象 | 現在 | 変更後 |
|---|---|---|
| `.interval-bar` の `padding` | `10px 12px` | `14px 12px` |
| `.interval-btn` の `min-height` | 44px | `var(--tap)`（56px） |
| `.interval-btn` の `font-size` | 14px | 16px |
| `.interval-time` の `font-size` | 22px | 28px |
| `.interval-time` の `min-width` | 62px | 76px（28pxで `0:00` が収まるよう拡げる） |
| `body.has-interval-bar` の `padding-bottom` | `calc(148px + env(safe-area-inset-bottom))` | `calc(170px + env(safe-area-inset-bottom))` |

バー高さは 66px → 86px（padding 28 + ボタン 56 + border 2）になる。`bottom: calc(68px + env(safe-area-inset-bottom))` は据え置きで、タブバーとの間隔は変わらない。

## テスト

新規 `test/coursePresets.test.js`:

- `missingExerciseNames`: 全て未登録 / 全て登録済み / 一部のみ未登録 / 重複名の除去 / 空配列
- **データ整合性**（手書きデータの誤記を機械的に検出するため必須）:
  - `DEFAULT_COURSE_PRESETS` の全種目名が `DEFAULT_EXERCISE_PRESETS` に実在すること
  - 各プリセットの種目数が `COURSE_MIN_EX` 以上 `COURSE_MAX_EX` 以下であること
  - 各プリセット内で種目名が重複していないこと
  - コース名が重複していないこと

`createStepper` と CSS はビュー層のため既存方針どおりユニットテスト対象外とし、ブラウザで手動確認する。

ブラウザでの確認項目:
- 記録タブの重量・回数・補助回数の初期表示が空欄で、プレースホルダの `0` が見えること
- 数値を直接入力でき、`＋` `−` が従来どおり動くこと
- 通常モードでセット1の重量を変えると未編集の他セットに追従すること（既存挙動の回帰確認）
- ドロップセットで保存すると重量が残り回数だけ空欄に戻ること（既存挙動の回帰確認）
- セット編集モーダルでも既存値が入り、空欄からの入力ができること
- 折りたたみと種目ヘッダーの矢印が大きく見やすくなり、タップ領域が広がっていること
- 休憩タイマーのバーが大きくなり、タブバーと重ならないこと
- 管理→コースの「プリセットから作成」で6つのチップが出て、タップでコースが作成され、追加された種目数が表示されること
- 種目未登録の状態からプリセットをタップして、種目とコースが両方できること
- スマホ幅375pxで横スクロールが発生しないこと

## スコープ外

- 既存ユーザーの `courses` へのプリセット自動投入（起動時 seed は行わない。ユーザーが明示的にタップしたときだけ作成する）
- コース名の重複防止
- プリセットコースの編集（作成後は通常のコースと同じく削除のみ）
- ステッパーの `value` を空にできる API 追加（`0` を空表示として扱う方式で足りるため）
