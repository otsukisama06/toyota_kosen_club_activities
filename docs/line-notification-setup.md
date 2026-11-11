# LINE 通知の設定手順

このドキュメントは、卓球部アプリ・弓道部アプリで使う LINE 通知を有効にするための手順です。

- 卓球部: タスク締め切り通知を送ります（`TABLE_TENNIS_LINE_MESSAGING_API_*`）
- 弓道部: 練習・試合の開始45分前に、出欠登録のお願いを部員の LINE グループへ1通送ります（`HANDBALL_LINE_MESSAGING_API_*`）。弓道部の出欠確認はメールでは送りません
  - 送信先IDには、Bot を招待した部員グループの `groupId` を指定します
  - 設定後、スーパーアドミン画面の「メール一斉送信」→「LINE へテスト送信する」で届くか確認できます
  - LINE 公式アカウントのメッセージ通数はプランごとに上限があり、グループへの送信はグループの人数分として数えられる場合があります。練習回数×部員数が上限に収まるか確認してください
Messaging API のチャネルアクセストークンを作成し、必要な環境変数を設定します。

## 1. 事前に確認するもの

- LINE Official Account のアカウント
- LINE Developers のプロバイダー
- Messaging API チャネル
- 通知先の `userId` / `groupId` / `roomId`

## 2. チャネルアクセストークンの作成

1. [LINE Developers Console](https://developers.line.biz/console/) にログインします。
2. 通知に使うプロバイダーを開きます。
3. `Messaging API` チャネルを作成、または既存のチャネルを開きます。
4. `Messaging API` 設定画面で、チャネルアクセストークンを発行します。
5. 発行したトークンを安全な場所に控えます。

補足:

- このアプリで使うのは `LINE Messaging API` のチャネルアクセストークンです。
- `LINE Notify` は使いません。
- トークンは第三者に見えないように管理してください。

## 3. 通知先IDの決め方

通知先は 1 つのアカウント、またはグループ/ルームにできます。

- 1人に送りたい場合: `userId`
- グループに送りたい場合: `groupId`
- ルームに送りたい場合: `roomId`

通常は、LINE Bot を友だち追加したうえで、Webhook で届く `source` 情報から確認します。

## 4. 環境変数の設定

### 卓球部アプリ単体で起動する場合

`apps/table-tennis/.env` に次を追加します。

```env
LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークンを入れる
LINE_MESSAGING_API_TARGET_ID=ここにuserId/groupId/roomIdを入れる
```

### ルートの `docker compose` で起動する場合

ルートの `docker-compose.yml` では、卓球部向けに次の変数名を渡します。

```env
TABLE_TENNIS_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークンを入れる
TABLE_TENNIS_LINE_MESSAGING_API_TARGET_ID=ここにuserId/groupId/roomIdを入れる
```

### Render など外部環境で起動する場合

環境変数に次を設定します。

```env
LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN=ここにチャネルアクセストークンを入れる
LINE_MESSAGING_API_TARGET_ID=ここにuserId/groupId/roomIdを入れる
```

## 5. どの変数が使われるか

卓球部アプリは、次の順で値を読みます。

1. `LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN`
2. `TABLE_TENNIS_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN`
3. `LINE_CHANNEL_ACCESS_TOKEN`

`TARGET_ID` も同じ順で読みます。

## 6. 動作確認

設定後、卓球部アプリで予定を登録し、開始時刻の 90 分前に LINE が届くか確認します。

送信されない場合は、次を確認してください。

- チャネルアクセストークンが正しいか
- 通知先IDが正しいか
- Bot が相手のユーザー、グループ、またはルームに参加しているか
- アプリの起動環境に環境変数が反映されているか

## 7. 注意点

- この実装は、イベント開始 90 分前を見つけて自動送信します。
- アプリが停止していると送信されません。
- 同じ予定には 1 回だけ送るようにしています。