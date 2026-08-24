# ジム予定の共有（メンバー連携の基盤） 設計書

## ゴール

知人・友人にアプリを配り、メンバー間で「直近いつ・どこのジムに・何時ごろ行く予定か」を共有できるようにする。あわせて、後続サイクルでトレーニング記録の共有を載せられる認証・同期の基盤を用意する。

## スコープ

今回作るもの:
- **A. Google認証とメンバー概念**
- **B. Firestore による共有データ基盤**
- **C. ジム予定の登録・共有・閲覧**

今回作らないもの（後続サイクル）:
- **D. トレーニング記録の共有**
- **E. 招待・オンボーディング導線**（メンバー追加は当面Firebaseコンソールでのルール編集）

## 前提・調査結果

- 現状は完全クライアントサイド。全データが端末内 IndexedDB（`js/db.js`、`DB_VERSION = 4`、10ストア）。GitHub Pages（静的ホスティングのみ、サーバーなし）で公開。ビルドステップなし
- リポジトリはPublic（無料プランでPages利用のため）。アプリURLは誰でも到達できるため、共有データの保護は「リンクを知っている人だけ」では成立せず、明示的な許可リストが必要
- 既存ストアには `bodyWeights`（体重）と `photos`（体形写真）という機微データが含まれる
- `js/views/places.js` にジム登録機能があり、`places` ストアが存在する
- `escapeHtml` は先のリファクタリングで `js/lib/html.js` に切り出し済み
- 同一ユーザーの別プロジェクト ShibaCare で、Firestore・Google認証（`signInWithPopup`）・メール許可リストによる家族間同期の実績がある。そこでは犬名の未エスケープが同期経由で他家族の画面に届く stored XSS になった事例があり、共有化と同時にエスケープ点検が要る

## 中核の設計判断

### 判断1: 既存の10ストアは同期しない。`js/db.js` は変更しない

同期対象は新概念の「予定」のみとする。既存の記録・体重・写真はローカルのまま一切触らない。

これにより:
- 既存ユーザーのデータ移行が発生しない
- 同期の不具合が既存の記録を破壊する経路が存在しない
- 体重・体形写真・トレーニング記録が「今回は共有機能を付けなかった」ではなく、**構造的に共有され得ない**

### 判断2: 予定は IndexedDB に持たず、Firestore のみに置く

Firestore SDK は自前の永続化（IndexedDB）を持ちオフライン読み書きをキューイングするため、アプリ側で `plans` ストアを作って双方向マージを実装する必要がない。

これにより:
- `js/db.js` は1行も変更しない（`DB_VERSION` は 4 のまま、`STORES` も不変）
- 新ストア追加時に `importAll` が旧バックアップを弾く既知のギャップ（`データが不足: <store>` を投げる）を踏まない
- last-write-wins のマージ実装が不要になる

代償として、未ログイン時・Firebase SDK 読み込み失敗時に予定は一切表示されない。予定は本質的にログイン前提の機能なので許容する。

### 判断3: サインインは任意。未ログインでも従来どおり全機能が動く

現在のソロ利用をログインウォールで壊さない。サインインして初めてホームに「みんなの予定」が現れる。

## ① 認証（A）

- Firebase Authentication の Google プロバイダ、`signInWithPopup`
- Firebase プロジェクトは ShibaCare（`shiba-care`）とは別に新規作成する
- 承認済みドメインに `jfagofor2014-stack.github.io` と `localhost` を追加する
- 設定値は `js/lib/firebase-config.js` にコミットする（Firebase の Web API キーは秘密情報ではなく、アクセス制御は後述の Firestore ルールで行う）
- サインイン状態は `onAuthStateChanged` で監視し、サインイン／サインアウトのボタンは管理タブの「設定」セクションに置く
- 表示名は Google アカウントの `displayName` をそのまま使う（ニックネーム上書きは今回入れない）

## ② Firestore の構造とルール（B）

コレクション: `crews/main/plans/{planId}`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function members() {
      return [
        'jfagofor2014@gmail.com'
      ];
    }
    function isMember() {
      return request.auth != null && request.auth.token.email in members();
    }
    match /crews/main/plans/{planId} {
      allow read: if isMember();
      allow create: if isMember()
        && request.resource.data.ownerEmail == request.auth.token.email;
      allow update, delete: if isMember()
        && resource.data.ownerEmail == request.auth.token.email;
    }
  }
}
```

メンバーを増やすときは `members()` の配列に Gmail を1行追記する。

- 読み取りは許可リストのメンバー全員
- 作成は自分自身を `ownerEmail` とするドキュメントのみ
- 更新・削除は自分が作成したドキュメントのみ（他人の予定を書き換え・削除できない）
- メンバー追加は許可リストに Gmail を1行追記する運用。招待導線は後続サイクル（E）

## ③ データモデル（C）

Firestore ドキュメント:

```
{
  ownerEmail: string,     // 認証済みメールアドレス。ルールで自己申告を防止
  ownerName: string,      // Google displayName（表示用）
  date: string,           // 'YYYY-MM-DD'
  startTime: string,      // 'HH:MM'
  placeName: string,      // ジム名（文字列）
  note: string,           // 任意（例: 「脚の日、補助してくれる人歓迎」）
  updatedAt: number       // Date.now()
}
```

**ジムは `placeId` ではなく `placeName`（文字列）で保持する。** `places` ストアの id は各自の端末で `uid()` により生成されるため、同じジムでもメンバー間で id が一致しない。id を跨いで解決するには `places` 自体の共有とマージが必要になり基盤が重くなる。入力時は自分の登録済みジムから選択でき（自由入力も可）、保存時にその名前を文字列として書き込む。表記ゆれによる完全一致グルーピングはできないが、少人数での「誰がいつどこに」の把握には足りる。

## ④ UI（C）

タブは4つのまま増やさない。ホームの挨拶カードの直下に「みんなの予定」カードを置く。

**未ログイン時**: カードを表示しない（ホームは現状のまま）

**ログイン時**:
```
みんなの予定                    [＋ 予定を追加]
─────────────────────────
8/16 (土)
  19:00  ゴールドジム渋谷   たいち   [編集] [削除]
  19:30  ゴールドジム渋谷   〇〇
8/18 (月)
  07:00  エニタイム△△      △△
```

- **当日を含む7日間の予定のみ表示**する（`date` が今日以上、かつ今日の6日後以下）。当日より前の予定は表示しない。一覧を常に行動可能な状態に保つと同時に、「誰がいつどこにいたか」の履歴が画面上に蓄積し続けないようにする（過去分のドキュメントは Firestore に残るが表示されない。少人数・1日数件の想定であり自動削除は設けない）
- 日付ごとに見出しを付け、日付昇順・同日内は時刻昇順で並べる
- 編集・削除ボタンは自分の予定にのみ表示する（表示制御に加え、Firestore ルールでも保証される）
- 予定が0件のときは「まだ予定がありません」と表示する

**予定の追加・編集フォーム**（既存の `openSetEditor` と同じモーダル方式を踏襲、`--z-modal` を使用）:
- 日付（`<input type="date">`、既定は今日）
- 時刻（`<input type="time">`）
- ジム（自分の `places` からの `<select>`＋自由入力欄）。`<select>` を選ぶと自由入力欄にその名前が入る。**保存されるのは常に自由入力欄の値**で、`<select>` は入力補助に過ぎない。`places` が0件なら `<select>` を出さず自由入力のみとする
- メモ（任意）

保存時は日付・時刻・ジム名がいずれも空でないことを検証し、空ならモーダル内にエラーを表示して保存しない。

## ⑤ 純粋関数とテスト

`js/lib/plans.js`（`node:test` で単体テスト）:

- `upcomingPlans(plans, today, days)` — `plan.date >= today` かつ `plan.date <= today + (days - 1)日` の予定を、日付昇順・同日内は時刻昇順で返す（`today` は `'YYYY-MM-DD'` 文字列、`days = 7` なら今日から6日後まで）
- `groupPlansByDate(plans)` — 日付ごとにまとめた `[{date, plans}]` を日付昇順で返す
- `canEditPlan(plan, currentUserEmail)` — `plan.ownerEmail === currentUserEmail`

Firestore との通信・認証は `js/lib/crew.js` に隔離し、既存方針どおりユニットテスト対象外とする。

テスト項目:
- `upcomingPlans`: 過去の予定を除外する / 範囲外の未来を除外する / 当日を含む / 同日内が時刻順になる / 空配列
- `groupPlansByDate`: 日付ごとにまとまる / 日付昇順になる / 空配列
- `canEditPlan`: 自分の予定は true / 他人の予定は false / `ownerEmail` 欠損は false

ブラウザでの手動確認:
- 未ログイン状態でホーム・記録・分析・管理の全タブが従来どおり動き、「みんなの予定」カードが出ないこと
- サインイン後にカードが出て、予定を追加・編集・削除できること
- 他人の予定に編集・削除ボタンが出ないこと
- 過去日の予定が一覧に出ないこと
- スマホ幅375pxで横スクロールが発生しないこと

## エラーハンドリング

- **Firebase SDK の読み込み失敗**: CDN（`https://www.gstatic.com/firebasejs/...`）からの動的 import を try/catch で囲み、失敗時は「みんなの予定」カードを描画しない。ホームの他の要素は通常どおり表示する。Service Worker の `ASSETS` は同一オリジンのみを対象とするため SDK はプリキャッシュされず、オフラインでの初回読み込みは失敗し得る。この経路でアプリ全体が壊れないことを保証する
- **サインイン失敗・キャンセル**: 設定セクションにメッセージを表示し、未ログイン状態を維持する
- **予定の保存失敗**（権限エラー・通信エラー）: モーダル内にエラーを表示し、モーダルを閉じない
- **許可リスト外のアカウントでのサインイン**: 認証自体は成功するが Firestore 読み取りが権限エラーになる。「このアカウントはメンバーに登録されていません」と案内する

## セキュリティと privacy

- **他メンバーの入力が自分の画面に入る**ため、`ownerName` / `placeName` / `note` はすべて `escapeHtml`（`js/lib/html.js`）を通して描画する。ShibaCare で同種の未エスケープが stored XSS になった事例があり、共有化により「自分の表示崩れ」から「他人への攻撃」に深刻度が上がる
- 予定は所在地とスケジュールの情報であり、裏返せばその時間に自宅にいないことの共有でもある。許可リストによる明示的なメンバー管理を必須とし、リンクを知っているだけの第三者は読めない
- 体重・体形写真・トレーニング記録は Firestore に一切書き込まない

## ファイル構成

- 新規 `js/lib/firebase-config.js` — Firebase の設定値
- 新規 `js/lib/crew.js` — Firebase SDK の動的 import、認証、`plans` の CRUD と購読
- 新規 `js/lib/plans.js` — `upcomingPlans` / `groupPlansByDate` / `canEditPlan`
- 新規 `js/views/plan-editor.js` — 予定の追加・編集モーダル
- 変更 `js/views/home.js` — 「みんなの予定」カードの描画と結線
- 変更 `js/views/settings.js` — サインイン／サインアウト
- 変更 `sw.js` — 新規ファイルを `ASSETS` に追加し、キャッシュバージョンを繰り上げ
- 新規 `test/plans.test.js`
- 新規 `firestore.rules` — 上記ルールをリポジトリに記録（デプロイはFirebaseコンソールで手動）

**`js/db.js` は変更しない。**

## スコープ外（後続サイクル）

- トレーニング記録の共有（D）
- 招待・オンボーディング導線（E）。当面メンバー追加は Firestore ルールの手動編集
- 予定と実際の記録の紐付け（予定した日に記録が付いたかの照合）
- 同じジム・同じ時間帯のメンバーの自動グルーピングや通知
- ニックネームによる表示名の上書き
