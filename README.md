# GACHI-FIT

中・上級トレーニー向け「感覚同期型」トレーニング記録 PWA。

## 機能
- ハイパーカスタムメニュー（部位細分化・意識ポイント・セットパターン）
- セット記録 + 推定1RM自動計算（Epley式）
- Sensory Log（メモ）
- インターバルタイマー
- ホーム/履歴でPR・推移を確認
- IndexedDB ローカル保存・PWA オフライン動作
- AIインサイト（Gemini、PR・感想から改善提案を生成）
- 推定1RM推移グラフ（自前SVG）
- ワークアウト振り返り・セット編集/削除
- データのエクスポート/インポート（JSON）
- Gemini による AI インサイト（APIキーは端末内に保存）
- 体形比較写真（IndexedDB保存・2枚並列比較）
- 大会カウントダウン・目標体重トラッキング
- セットパターンのカスタム管理
- 記録タブ: 重量/回数ステッパー、独立インターバル、本日セットの編集/削除、トレーニング時間・場所・感想の記録
- Obsidian共有：日別トレーニングをMarkdownで送信／ダウンロード（設定でvault名・出力フォルダを登録）
- 記録タブ: 種目単位のまとめ保存（最大6セット）、インターバル終了10秒前のビープ音、種目プリセット検索、0.5kg単位の重量調整
- 記録タブ: スーパーセット（種目2〜4を連続実施）・ドロップセット（同種目の重量を連続実施）モード、本日のセット一覧でグループ表示

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

## 共有機能を有効にする
「みんなの予定」（ジム予定の共有）は Firebase を使う。未設定の間はこの機能全体が休眠し、
他の機能には影響しない。有効にするには以下の手順を行う。

1. [Firebase コンソール](https://console.firebase.google.com/)で新規プロジェクトを作成する（ShibaCare とは別プロジェクトにする）。
2. **Firestore は「本番モード」で作成する。** テストモードは30日間だれでも読み書きできる状態になる。このリポジトリはルールを自動デプロイしないため、最初から本番モードで作る。
3. `firestore.rules` の内容をコンソールの Firestore ルール画面に貼って公開する。**設定値（`js/lib/firebase-config.js`）を入れる前に、ルールを先に公開すること。**無防備な窓を作らないため。
4. Authentication で **Google プロバイダのみ**を有効にする。他のプロバイダを有効にすると、ルール側で `email_verified` を要求していても攻撃対象が広がる。
5. Storage と Realtime Database は**有効化しない**。このアプリはどちらも使わない。有効化するとデフォルトルールが署名済みユーザー全員に開いた状態になる。
6. 承認済みドメインに `jfagofor2014-stack.github.io` と `localhost` を追加する。
7. ウェブアプリを登録して firebaseConfig を取得し、`js/lib/firebase-config.js` の `'REPLACE_ME'` を実際の値に置き換えてコミット・push する。
8. メンバーを増やすときは `firestore.rules` の `members()` 配列に Gmail アドレスを1行追記し、コンソールで再公開する。
9. 動作確認は**インストール済みの PWA からも**行うこと。`display: standalone` ではポップアップ方式の OAuth が不安定なことがある。

## 構成
- `js/lib/calc.js` 純粋ロジック / `js/db.js` IndexedDB / `js/timer.js` タイマー
- `js/views/*` 各画面 / `js/app.js` ルーティング
- `manifest.json` / `sw.js` PWA
