# 記録画面レイアウト修正・重量自動入力・ビープ改善 設計書

## ゴール
スマホ縦画面で記録タブが横スクロールしてしまう不具合を解消する（今回最優先）。あわせて、通常モードで同じ種目を複数セット記録する際の重量入力の手間を減らし、インターバルのビープ音を残り10秒から毎秒鳴らし0秒で長めの音にする。

## 前提・調査結果
- 実機（375px幅）で記録タブを確認したところ、`重量(kg)`ステッパーの「＋」ボタンが画面右端で見切れ、`document.documentElement.scrollWidth` が816pxまで広がっていた（横スクロールが発生）。
- 原因：`js/views/workout.js` の通常/ドロップセット行UI、およびスーパーセットのラウンド表で、重量ステッパーと回数ステッパーを `.row`（`display:flex`で2分割）で横並びにしているため、各ステッパー（−ボタン56px＋input＋＋ボタン56px）が半分の幅に収まらない。
- `js/views/set-editor.js`（セット編集モーダル）は元々 `.row` を使わず縦積みなので変更不要。

## 機能詳細

### ① レイアウト修正（最優先）
- `js/views/workout.js` の通常/ドロップセット行テンプレート：重量・回数を囲んでいた `<div class="row">` を外し、`<div class="field">`（重量）→`<div class="field">`（回数）の順に縦積みにする。
- `js/views/workout.js` のスーパーセットのラウンド表セルも同様に `.row` を外し縦積みにする。あわせて種目名の重複表示（「種目名 重量(kg)」「種目名 回数」）をやめ、種目名を小見出し（例：`<div class="muted" style="margin-bottom:4px">ベンチプレス</div>`）として1回だけ出し、その下に「重量(kg)」「回数」ラベルを置く。
- CSS（`css/style.css`）は変更不要（`.field`は既に`display:block`相当で縦積みされる）。

### ② 通常モードの重量自動入力
- 行データ `rowValues[i]` に `weightTouched: boolean`（初期値 `false`）を追加。
- セット1（`i === 0`）の重量ステッパーの `onChange` で、`rowValues` の `i > 0` かつ `weightTouched === false` な行すべてに対し、その行の重量ステッパーへ同じ値を `set()` し `rowValues[i].weight` も更新する（即時反映）。
- セット2以降の重量ステッパーの `onChange` では、そのセットの `weightTouched` を `true` にする（以後セット1の変更に追従しない）。
- 「＋ 行を追加」で新規行を作る際、新しい行の初期重量はその時点のセット1の重量、`weightTouched: false`（以後もセット1に追従する）。
- ドロップセットモード（`mode === 'dropset'`）とスーパーセットのラウンド表には適用しない（既存どおり0初期値・手入力）。

### ③ インターバルのビープ音
- `js/lib/sound.js`：
  - `shouldBeep(remaining, thresholdSec = 10)` を `remaining > 0 && remaining <= thresholdSec`（残り1〜10秒なら毎秒true）に変更。
  - 新規 `shouldFinalBeep(remaining)` を追加：`remaining === 0` でtrue。
  - `playBeep` のシグネチャは変更しない（既存の `{frequency, durationMs}` オプションをそのまま利用）。
- `js/views/workout.js` のインターバルタイマー `onTick` 内：
  ```js
  if (shouldFinalBeep(s)) playBeep({ frequency: 1200, durationMs: 400 });
  else if (shouldBeep(s)) playBeep();
  ```
  （カウントダウン中は既存の880Hz・150ms、0秒到達時は1200Hz・400msの長めの音）

## ファイル構成（変更のみ、新規ファイルなし）
- 変更 `js/lib/sound.js`（`shouldBeep`のロジック変更、`shouldFinalBeep`追加）
- 変更 `test/sound.test.js`（`shouldBeep`の新ロジック用テスト更新、`shouldFinalBeep`のテスト追加）
- 変更 `js/views/workout.js`（行UI・スーパーセット表の縦積み化、重量自動入力ロジック、ビープ呼び出し変更）
- 変更 `sw.js`（キャッシュバージョン更新のみ、v14→v15）

## エラーハンドリング
- 既存のバリデーション（少なくとも1セット入力、補助回数≤回数）は変更なし。
- 重量自動入力は表示上の初期値コピーのみで、保存時のバリデーションには影響しない。

## テスト
- `sound.js`：`shouldBeep`が残り1〜10秒で true、11秒以上・0以下で false（境界値含む）。`shouldFinalBeep`が0でtrue、それ以外でfalse。
- 重量自動入力・レイアウト崩れ解消はブラウザで手動確認（`js/views/workout.js`は既存方針どおりDOM/ビュー層でユニットテスト対象外）：
  - 375px幅で横スクロールが発生しない（`document.documentElement.scrollWidth <= innerWidth` を確認）
  - セット1の重量を変更するとセット2・3に即時反映される
  - セット2の重量を手動で変えた後にセット1を変更しても、セット2は追従しない
  - 行追加時、新しい行の初期重量がセット1の現在値になる
  - ドロップセット・スーパーセットでは重量が自動入力されない
  - インターバル開始後、残り10秒から毎秒ビープ、0秒で高め・長めの音が鳴る

## スコープ外
- ドロップセット・スーパーセットへの重量自動入力の拡張（次サイクル以降、必要になれば）
- ビープ音の音量・波形などのさらなるカスタマイズ設定UI
