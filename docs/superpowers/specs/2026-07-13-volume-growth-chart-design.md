# 部位別ボリューム成長曲線 設計書

## ゴール
ホーム画面の「部位別最高ボリューム」カードで、各部位をタップして展開した時に、自己ベスト（過去最高ボリューム）がどう更新されてきたかを階段状の折れ線グラフで表示する。

## 前提・調査結果
- 既存の `js/lib/chart.js` の `sparklinePath`（直線補間のSVG path生成、外部ライブラリなし）を `js/views/history.js` が種目別の推定1RM推移スパークラインに使っている。今回もこの軽量SVG方式を踏襲する
- `js/lib/volume.js` に部位別ボリューム集計の各種関数（`setVolume`/`categoryKey`/`categoryVolumeForDate`/`maxCategoryVolumeExcludingDate`/`maxCategoryVolumeWithDate`）と `VOLUME_START_DATE`（2026-06-28、これ以降のみ集計対象）がすでにある
- `js/views/home.js` の「部位別最高ボリューム」カードは、各部位行（`.vol-row`）をタップすると `.vol-breakdown` にその最高日のセット内訳が展開される既存動作がある

## 機能詳細

### ① 日別ボリューム集計と自己ベスト推移の抽出（`js/lib/volume.js`）
- `dailyCategoryVolumes(sets, exById, wkById, cat, sinceDate)`：指定部位・`sinceDate`以降の日別ボリューム合計を `{date, volume}[]`（日付昇順）で返す純粋関数
- `categoryPRProgression(dailyVolumes)`：`dailyCategoryVolumes`の出力を受け取り、自己ベストが更新された点だけを時系列順に抽出した `{date, volume}[]`（volumeは単調増加）を返す純粋関数

### ② 階段グラフのSVGパス生成（`js/lib/chart.js`）
- `stepPath(values, width, height, pad=2)`：数値配列から階段状（水平→垂直の順に繋ぐ）のSVG path `d` 文字列を生成する純粋関数。既存の `sparklinePath` と同じ min/max→y座標マッピングのロジックを流用し、繋ぎ方だけ階段状にする

### ③ ホーム画面への組み込み（`js/views/home.js`）
- 各部位行のタップ時ハンドラ（`.vol-row`のクリックイベント）内で、`dailyCategoryVolumes`→`categoryPRProgression`を呼び出し、結果が2点以上あれば `.vol-breakdown` の先頭に階段グラフ（`<svg class="spark">`、履歴タブと同じ表示サイズ）と「開始日 ○kg → 現在 △kg」のキャプションを追加表示する
- 自己ベスト更新点が1点以下（その部位を1回しか記録していない等）の場合はグラフ・キャプションを表示せず、既存のセット内訳のみ表示する
- 展開前の行表示・タップして開閉する既存動作は変更しない

## ファイル構成（変更のみ、新規ファイルなし）
- 変更 `js/lib/volume.js`：`dailyCategoryVolumes`・`categoryPRProgression` を追加
- 変更 `js/lib/chart.js`：`stepPath` を追加
- 変更 `js/views/home.js`：部位行タップ時のハンドラにグラフ描画を追加
- 変更テスト：`test/volume.test.js`（新規関数のテスト追加）、`test/chart.test.js`（`stepPath`のテスト追加、ファイルが無ければ新規作成）

## エラーハンドリング
- 特になし（既存の集計関数と同様、データが無ければ空配列を返す。グラフ描画側は点が2点未満なら非表示にするのみ）

## テスト
- `dailyCategoryVolumes`：複数日・複数部位が混在するセットから指定部位・sinceDate以降のみ日付昇順で正しく集計されること
- `categoryPRProgression`：単調増加する点だけが残ること（自己ベストを更新しない日はスキップされる）、全ての日が新記録なら全点残ること、1点のみの入力は1点のまま返ること
- `stepPath`：2点の階段パスが水平線分＋垂直線分の組み合わせになっていること、1点のみは`sparklinePath`同様に単一の`M`コマンドのみになること、空配列は空文字列を返すこと
- `home.js`はビュー層のため既存方針どおりユニットテスト対象外。ブラウザで以下を手動確認：
  - 複数日にわたって同じ部位のセットを記録した状態でホーム画面の部位別最高ボリュームの行をタップ→階段グラフとキャプションが表示される
  - 1回しか記録していない部位はグラフが表示されず、既存のセット内訳のみ表示される
  - 既存のタップして開閉する動作・セット内訳表示に回帰がないこと
