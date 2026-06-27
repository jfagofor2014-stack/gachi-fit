# GACHI-FIT

中・上級トレーニー向け「感覚同期型」トレーニング記録 PWA。

## 機能
- ハイパーカスタムメニュー（部位細分化・意識ポイント・セットパターン）
- セット記録 + 推定1RM自動計算（Epley式）
- Sensory Log（腹圧/対象筋負荷/ROM）とセット品質スコア
- インターバルタイマー
- ホーム/履歴でPR・推移を確認
- IndexedDB ローカル保存・PWA オフライン動作
- 定型タグ＋メモとルールベースのインサイト（タグ頻度・スコア/1RM相関）
- 推定1RM推移グラフ（自前SVG）
- ワークアウト振り返り・セット編集/削除
- データのエクスポート/インポート（JSON）
- Gemini による AI インサイト（APIキーは端末内に保存）
- 体形比較写真（IndexedDB保存・2枚並列比較）
- 大会カウントダウン・目標体重トラッキング
- セットパターンのカスタム管理
- 記録タブ: 重量/回数ステッパー、独立インターバル、本日セットの編集/削除、トレーニング時間・場所・感想の記録
- Obsidian共有：日別トレーニングをMarkdownで送信／ダウンロード（設定でvault名を登録）

## 開発
```bash
npm test                      # 純粋ロジックのユニットテスト
python3 -m http.server 8765   # http://localhost:8765 で起動
```

## 公開（GitHub Pages）
リポジトリ Settings → Pages → Source を `main` / `(root)` に設定すると
`https://jfagofor2014-stack.github.io/gachi-fit/` で公開される。

## AI機能の利用
[Google AI Studio](https://aistudio.google.com/apikey) でGemini APIキーを取得し、
アプリの「その他 → 設定」で登録する。

## 構成
- `js/lib/calc.js` 純粋ロジック / `js/db.js` IndexedDB / `js/timer.js` タイマー
- `js/views/*` 各画面 / `js/app.js` ルーティング
- `manifest.json` / `sw.js` PWA
