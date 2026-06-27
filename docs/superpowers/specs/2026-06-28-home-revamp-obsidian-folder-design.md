# ホーム再構成＋部位集計変更＋Obsidianフォルダ 設計書

## ゴール
ホーム画面を再構成し（カレンダー最上部・本日セット数廃止・推定1RMをアコーディオン化・部位別最高ボリュームを日付付き数値＋内訳タップ化）、部位の集計キーを bodyPart の「/より前」に変更、測定開始日を 2026-06-28 に固定、Obsidian の出力フォルダを指定可能にする。

## 前提・制約
- Phase1-3＋各改善を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- 部位集計キー：`bodyPart` の `/` より前（trim）。空なら `category`、それも無ければ `その他`
- 測定開始日 `VOLUME_START_DATE = '2026-06-28'`（この日以降のワークアウトのみ集計）
- 加算的変更・新規ストアなし

## 機能詳細

### 1. 部位集計キーの変更（volume.js）
- 純粋関数 `categoryKey(ex)` を追加：
  - `ex.bodyPart` があれば `bodyPart.split('/')[0].trim()`（空文字になる場合は次へ）
  - 無ければ `ex.category`、それも無ければ `'その他'`
- `categoryVolumeForDate` / `maxCategoryVolumeExcludingDate` の部位判定を `categoryKey` に統一
- `VOLUME_START_DATE = '2026-06-28'` を export

### 2. 測定開始日と最高日付（volume.js）
- `maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate, sinceDate)` に **sinceDate** 引数を追加：`wk.date < sinceDate` の日を集計から除外（記録タブのバーで使用、`sinceDate=VOLUME_START_DATE`）
- 新規 `maxCategoryVolumeWithDate(sets, exById, wkById, sinceDate)` → `{ 部位: { volume, date } }`：sinceDate 以降のみで、各部位の「日合計が最大の日」とその合計を返す（ホーム一覧で使用）

### 3. ホーム画面の再構成（home.js）
並び（上から）：
1. **トレーニングカレンダー**（最上部）。日タップで下に日詳細を展開（現状の `renderDayDetail` 維持。Obsidianボタン等もそのまま）
2. **大会カウントダウン**（goals 設定があれば。カレンダーの下）
3. **推定1RM**：`<details>`/トグルで見出しのみ表示し、タップで PR 一覧（種目別 推定1RM）を展開
4. **部位別 最高ボリューム**：
   - `maxCategoryVolumeWithDate(sets, exById, wkById, VOLUME_START_DATE)` を取得し、volume 降順で各部位を行表示：`部位名` と `${Math.round(volume)}kg（M/D）`（日付は最高日）。**バーなし**
   - 行タップで**その最高日の該当部位セット**を内訳として展開／折りたたみ：その日のワークアウトの、`categoryKey===部位` の種目のセット（`種目名 重量kg×回数（補助N） ボリュームN`）
   - データが無ければカード自体を非表示
- **本日のセット数カードは削除**

### 4. 記録タブのボリュームバー（workout.js）
- `maxCategoryVolumeExcludingDate(..., today, VOLUME_START_DATE)` を使い、過去最高を 2026-06-28 以降基準に統一（バー表示自体は現状維持）

### 5. Obsidian 出力フォルダ（settings.js / home.js / obsidian.js）
- 設定に「Obsidian フォルダ」入力欄を追加 → localStorage `obsidian_folder`
- 「Obsidianに送る」の `file` を、フォルダ指定があれば `フォルダ/gachi-fit-<日付>.md`、無ければ `gachi-fit-<日付>.md`
- 「Markdown DL」のファイル名はスラッシュ不可のため `gachi-fit-<日付>.md` のまま
- `buildObsidianUri` は変更不要（file 文字列にフォルダを含めて渡す）

## ファイル構成（変更）
- `js/lib/volume.js`：`categoryKey`・`VOLUME_START_DATE`・`maxCategoryVolumeWithDate` 追加、`maxCategoryVolumeExcludingDate` に sinceDate 追加、`categoryVolumeForDate` を categoryKey 使用に
- `js/views/home.js`：レイアウト再構成、PRアコーディオン、部位別最高ボリューム（日付＋内訳タップ）、本日セット数削除
- `js/views/workout.js`：バーの過去最高に VOLUME_START_DATE 適用
- `js/views/settings.js`：Obsidian フォルダ入力
- `js/lib/obsidian.js`：変更なし（file にフォルダを含めるのは呼び出し側）
- `sw.js`：キャッシュ v12
- テスト：`test/volume.test.js` に `categoryKey`・`maxCategoryVolumeWithDate`・sinceDate のテスト追加

## エラーハンドリング
- 部位別ボリュームが空（6/28以降の記録なし）：カード非表示
- 内訳タップで該当セットが無い：「内訳なし」表示
- bodyPart が `/` のみ等で空キーになる場合は `その他`

## テスト
- `categoryKey`：`{bodyPart:'胸/上部'}→'胸'`、`{bodyPart:'背中'}→'背中'`、`{bodyPart:'',category:'肩'}→'肩'`、`{}→'その他'`
- `maxCategoryVolumeExcludingDate` の sinceDate：開始日より前の日が除外されること
- `maxCategoryVolumeWithDate`：部位ごとに最大日合計とその日付を返すこと
- ホームのレイアウト・アコーディオン・内訳タップ・Obsidianフォルダ送信はブラウザ/実機で手動確認

## スコープ外
- 部位の編集UI追加、ボリュームの時系列グラフ、フォルダのオートコンプリート
