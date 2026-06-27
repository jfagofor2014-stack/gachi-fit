# Obsidian共有 設計書

## ゴール
1日のトレーニング記録を Markdown 化し、Obsidian に新規ノートとして送る（または .md をダウンロードする）。Voice Journal の方式を踏襲する。

## 前提・制約
- Phase1-3＋各改善を踏襲：Vanilla JS（ESモジュール）＋ PWA ＋ IndexedDB、テストは `node --test`
- vault名は localStorage `obsidian_vault` に保存（Gemini キーと同方式）
- 読み取りのみ（新規ストアなし）
- 既存 `getAll`/`localDateStr` 等に準拠

## 機能詳細

### 1. Markdown生成（純粋ロジック）
新規 `js/lib/obsidian.js`：
- `workoutToMarkdown(data)` → フロントマター＋本文の文字列を返す。`data` は整形済みの1日分：
  ```
  {
    date: '2026-06-22',
    place: '〇〇ジム',         // 無ければ ''
    durationMin: 90,           // 無ければ 0
    note: '胸の張りが良い',     // 感想（無ければ ''）
    volume: { 胸: 600, 背中: 400 }, // 部位別ボリューム（四捨五入済み数値）
    exercises: [               // 種目ごと
      { name: 'ベンチプレス', category: '胸', sets: [
        { weight: 100, reps: 6, assistedReps: 0, estimated1RM: 120, tags: ['調子良い'], note: '' },
      ] },
    ],
  }
  ```
- フロントマター（YAML）例：
  ```
  ---
  date: 2026-06-22
  place: 〇〇ジム
  duration_min: 90
  volume_胸: 600
  volume_背中: 400
  tags: [gachi-fit]
  ---
  ```
  （`place` は値が空なら省略。`volume_<部位>` は各部位を1行ずつ。YAMLキーに使えるよう部位名はそのまま使用）
- 本文：
  ```
  # 2026-06-22 トレーニング
  場所: 〇〇ジム / 時間: 90分

  ## ベンチプレス（胸）
  - 100kg × 6（推定1RM 120）
  - 100kg × 5（補助2, 推定1RM 116）

  ## 感想
  胸の張りが良い
  ```
  - メタ行（場所/時間）は値があるものだけ表示
  - セット行に補助があれば「補助N」、タグ・メモがあれば末尾に「— タグ: …／メモ: …」を付す
  - 感想セクションは note があるときのみ
- `buildObsidianUri(vault, fileName, content)` → `obsidian://new?vault=<enc>&file=<enc>&content=<enc>`（`encodeURIComponent`）
- `downloadText(text, fileName)` → Blob を生成しダウンロード（Voice Journal と同実装。ブラウザ専用）

### 2. 設定：vault名
- `settings.js` に「Obsidian vault名」入力欄を追加 → 保存ボタンで localStorage `obsidian_vault` に保存

### 3. ボタン（ホーム日詳細）
- `home.js` の `renderDayDetail` の末尾に2ボタンを追加：
  - **「Obsidianに送る」**：vault名が未設定なら案内メッセージ。設定済みなら `location.href = buildObsidianUri(vault, fileName, workoutToMarkdown(data))`
  - **「Markdown DL」**：`downloadText(workoutToMarkdown(data), fileName)`
  - `fileName = `gachi-fit-${date}.md``
- 記録が無い日にはボタンを出さない（既存の「記録はありません」表示のまま）

### 4. データ整形（home.js）
- `renderDayDetail` 内で取得済みの workout・sets・exercises・places・sensoryLogs から `workoutToMarkdown` 用の `data` を組み立てるヘルパー `buildDayData(...)` を用意（home.js 内のローカル関数）。
- 部位別ボリュームは `lib/volume.js` の `categoryVolumeForDate(sets, exById, wkById, date)` を四捨五入して `volume` に格納

## データ整形の詳細
- `exercises` 配列：その日のセットを `exerciseId` でグループ化し、種目名・category・各セット（weight/reps/assistedReps/estimated1RM/tags/note）を格納。tags/note は対応する sensoryLog から
- 種目の並び順はセットの最初の登場順

## エラーハンドリング
- vault未設定で「Obsidianに送る」：日詳細内にメッセージ「設定でvault名を登録してください」
- セット0の日はボタン非表示（記録なし表示）

## テスト
- `obsidian.js`：
  - `workoutToMarkdown` が日付見出し・種目名・セット行・部位別ボリューム・感想を含むこと、補助/タグ/メモの付与、空の場所/感想の省略
  - `buildObsidianUri` が vault/file/content をエンコードした `obsidian://new?...` を返すこと
- 設定保存・ボタン動作・実際の Obsidian 連携はブラウザ/実機で手動確認（`downloadText` は canvas/Blob 依存のためUI確認）

## 配信
- Service Worker キャッシュ v11、`js/lib/obsidian.js` を ASSETS に追加

## スコープ外
- 複数日の一括エクスポート、Obsidian Advanced URI、自動同期、添付（写真）共有
