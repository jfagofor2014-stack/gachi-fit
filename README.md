# GACHI-FIT

中・上級トレーニー向け「感覚同期型」トレーニング記録 PWA（Phase1）。

## 機能
- ハイパーカスタムメニュー（部位細分化・意識ポイント・セットパターン）
- セット記録 + 推定1RM自動計算（Epley式）
- Sensory Log（腹圧/対象筋負荷/ROM）とセット品質スコア
- インターバルタイマー
- ホーム/履歴でPR・推移を確認
- IndexedDB ローカル保存・PWA オフライン動作

## 開発
```bash
npm test                      # 純粋ロジックのユニットテスト
python3 -m http.server 8765   # http://localhost:8765 で起動
```

## 構成
- `js/lib/calc.js` 純粋ロジック / `js/db.js` IndexedDB / `js/timer.js` タイマー
- `js/views/*` 各画面 / `js/app.js` ルーティング
- `manifest.json` / `sw.js` PWA
