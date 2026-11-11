# Toyota Kosen Club Activities

弓道アプリと卓球アプリを1つの入口に統合した運用用プロジェクトです。

## 構成

- `apps/handball`: 弓道アプリ（ディレクトリ名・DB名・環境変数名は旧ハンドボール時代の `handball` / `HANDBALL_*` を継続使用。機能は卓球アプリと同等）
- `apps/table-tennis`: 卓球アプリ
- `gateway/server.cjs`: 部活選択画面と内部プロキシ
- `docker-compose.yml`: 統合起動設定
- `docker-compose.tunnel.yml`: Cloudflare Tunnel設定

## 仕様

- 初回アクセスで部活を選択（弓道 or 卓球）
- 選択後はそれぞれの既存ログイン画面へ遷移
- ログインは個人パスワード＋メールの6桁確認コード（二段階認証）
  - ログイン: ニックネーム（またはメールアドレス）とパスワードを入力 → 登録メールアドレスに届く確認コードを入力
  - 新規登録: 確認コードでメールアドレスを確認してからアカウントを作成
  - パスワード再設定: 登録メールアドレスに届く確認コードで再設定（部活共通パスワード時代の既存ユーザの初回設定も同じ画面）
  - 確認コードは10分有効・5回まで入力可・再送信は60秒間隔。パスワードを10回間違えると15分ロック
  - メールが未登録の既存ユーザは、管理画面の部員詳細でメールアドレスを登録してから設定する
  - 確認コードのメール送信に `ATTENDANCE_REMINDER_EMAIL_API_KEY`（または `RESEND_API_KEY`）が必須。卓球は送信元 `ATTENDANCE_REMINDER_EMAIL_FROM`（または `EMAIL_FROM`）も必須
- `admin` の追加確認パスワードは環境変数で設定
  - `HANDBALL_SUPER_ADMIN_LOGIN_PASSWORD`
  - `TABLE_TENNIS_SUPER_ADMIN_LOGIN_PASSWORD`
- データベースは部活ごとに分離
  - `handball_notes`
  - `table_tennis_notes`
- スーパーアドミン画面（`/super-admin`、`admin` ニックネームのアカウントのみ）
  - 入り方: admin でログイン → プロフィール画面の「スーパーアドミン」ボタン、または管理画面の「管理者専用機能」→「スーパーアドミン画面」（旧 `/admin/super-admin` は自動で移動）
  - ダッシュボード: 部員数・メール/パスワード設定状況・ログイン制限中の人数・通達・フィードバック件数・サーバ概要
  - メール一斉送信: 全部員／役職／学年／パスワード未設定者／個別選択で送信（宛先ごとに個別送信、`{nickname}` 差し込み、送信履歴を保存）
  - 通達メッセージ、部員アカウント（ロック解除・強制ログアウト）、サーバ状態、データ管理（予定全削除・DB軽量化）、リリースノート、フィードバック
- メール送信元アドレス: 弓道は `kyudo@toyotakosenclubnotes.cc` 固定、卓球は `ATTENDANCE_REMINDER_EMAIL_FROM` / `EMAIL_FROM`
- LINE通知は卓球のみ（`TABLE_TENNIS_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN` / `TABLE_TENNIS_LINE_MESSAGING_API_TARGET_ID`）。弓道はLINE通知なし

## データ永続化

`docker-compose.yml` では PostgreSQL の named volume `postgres_data` を使用します。

- `docker compose down` ではデータは消えません
- データを消す場合のみ `docker compose down -v` を使用

## 自動バックアップ（0時・12時、最大3日）

`db-backup` サービスが次のポリシーで自動バックアップします。

- ハンドボールDB: 0時と12時に保存
- 卓球DB: 0時と12時に保存
- 保持期間: 最大3日（6世代）
- 保存先ディレクトリ（競技ごとに分離）:
  - `backups/handball`
  - `backups/table-tennis`

`db-backup` は `profile: backup` を指定した場合のみ起動されます。

  バックアップ有効化の起動例:

  ```bash
  docker compose --profile backup up -d
  ```

## Dockerイメージの公開（GitHub Container Registry）

デプロイ時間を短縮するために、DockerイメージをGitHub Container Registry (GHCR) に公開することを推奨します。

### GitHub Personal Access Tokenの作成

1. [GitHub設定ページ](https://github.com/settings/tokens) にアクセス
2. "Fine-grained tokens" → "Generate new token"
3. 設定:
   - Token name: `ghcr-access`
   - Expiration: 選択
   - Permissions:
     - `Contents`: `Read and write`
   - Repository access: `Only select repositories` → `toyota_kosen_club_activities`
4. "Generate token" をクリック
5. 表示されたトークンをコピーして安全な場所に保存

### Dockerイメージのビルドとpush

```bash
# GitHubにログイン
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# イメージをビルド
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/toyota-kosen-club:latest .

# push
docker push ghcr.io/YOUR_GITHUB_USERNAME/toyota-kosen-club:latest
```

### サーバーでのpullと起動

```bash
# GitHubからログイン
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# イメージをpull
docker pull ghcr.io/YOUR_GITHUB_USERNAME/toyota-kosen-club:latest

# docker-compose.yml を編集（buildをimageに変更）
# 変更前:
#   app:
#     build:
#       context: .
#       dockerfile: Dockerfile
# 変更後:
#   app:
#     image: ghcr.io/YOUR_GITHUB_USERNAME/toyota-kosen-club:latest
```

### GitHub Secretsへの登録（任意）

CI/CDで自動デプロイする場合:
1. リポジトリ設定 → Secrets and variables → Actions
2. "New repository secret" をクリック
3. 名前: `GHCR_TOKEN`、値: Personal Access Token
4. Docker pushスクリプトから使用

### 自動ビルド・pushスクリプト（任意）

ローカルから直接pushする場合のスクリプト例:

```bash
#!/bin/bash
# push-to-ghcr.sh - このスクリプトをexecutableにして使用

GITHUB_USERNAME="YOUR_GITHUB_USERNAME"
REPO_NAME="toyota_kosen_club_activities"
IMAGE_TAG="toyota-kosen-club:latest"

# GitHubにログイン
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# ビルド
docker build -t ghcr.io/$GITHUB_USERNAME/$IMAGE_TAG .

# Push
docker push ghcr.io/$GITHUB_USERNAME/$IMAGE_TAG

# ログアウト
docker logout ghcr.io
```

## サーバーへのSSH接続

デプロイ先サーバーへのSSH接続方法を説明します。

### SSHキーの生成（初回のみ）

ローカルマシンで以下を実行してSSHキーを生成:

```bash
# SSHキーの生成
ssh-keygen -t ed25519 -C "your_email@example.com"

# 公開キーを表示
cat ~/.ssh/id_ed25519.pub
```

生成された公開キー（`ssh-ed25519...`で始まる文字列）をサーバーの`~/.ssh/authorized_keys`に追加します。

### サーバーへの接続

```bash
# SSHで接続
ssh user@SERVER_IP

# ポート指定がある場合
ssh -p PORT user@SERVER_IP

# SSHキーを使用する場合
ssh -i ~/.ssh/id_ed25519 user@SERVER_IP
```

### 一般的なSSH接続例

```bash
# 通常接続
ssh club@192.168.1.100

# Raspberry Piの場合（デフォルトユーザー: pi）
ssh pi@192.168.1.50

# ドメイン指定の場合
ssh user@your-server.example.com
```

### SSH接続後の初期設定

サーバーに接続後、初回に以下を実行:

```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# Dockerインストール（未インストールの場合）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Gitインストール（未インストールの場合）
sudo apt install -y git

# 新しいグループメンバーシップを有効化
newgrp docker
```

### SSH接続の便利設定

`~/.ssh/config` に以下を記述して接続を簡略化:

```
Host toyota-kosen
    HostName 192.168.1.100
    User club
    IdentityFile ~/.ssh/id_ed25519
    Port 22

Host pi-server
    HostName 192.168.1.50
    User pi
    IdentityFile ~/.ssh/id_ed25519
```

設定後、`ssh toyota-kosen` で接続可能。

## ドメイン公開（Cloudflare Tunnel）

このプロジェクトは、Cloudflare Tunnelを使用してドメインで公開することを前提としています。

### 事前準備

1. **Cloudflareアカウントの準備**
   - [Cloudflare Zero Trust](https://one.cloudflare.com/) にログイン
   - ドメインをCloudflareで設定済みであること

2. **Tunnelトークンの取得**
   - Cloudflare Zero Trustダッシュボード → Networks → Tunnels
   - "Create a tunnel" → "Connector method" を選択
   - 表示されるJSONトークンをコピーして保存

### デプロイ手順

#### ステップ1: サーバーの準備

Linuxサーバー（Ubuntu 22.04推奨）に以下をインストール：

```bash
# DockerとDocker Composeのインストール
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Gitのインストール（コード取得用）
sudo apt install -y git
```

#### ステップ2: プロジェクトの取得

```bash
cd /opt
git clone git@github.com:TsugeYuki-EE/toyota_kosen_club_activities.git
cd toyota_kosen_club_activities
```

#### ステップ3: 環境変数の設定

```bash
# サンプルファイルをコピー
cp .env.example .env.tunnel

# 環境変数を編集
nano .env.tunnel
```

`.env.tunnel` の設定項目:

```env
# === Cloudflare Tunnel ===
# Cloudflare Tunnelで取得したトークンを設定
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...（長いJSON文字列）

# 公開するドメインを指定（httpsから開始）
PUBLIC_BASE_URL=https://your-domain.example.com

# HTTPS強制を有効化
FORCE_HTTPS=true

# 初回デプロイ時はtrue、2回目以降はfalseでも可
RUN_DB_MIGRATIONS=true

# === PostgreSQL ===
POSTGRES_USER=club
POSTGRES_PASSWORD=強力なパスワードを設定

# === 管理画面用キー ===
# ランダムな文字列を設定（少なくとも32文字）
HANDBALL_ADMIN_VIEW_KEY=ランダムな文字列1
TABLE_TENNIS_ADMIN_VIEW_KEY=ランダムな文字列2

# === スーパー管理者ログイン用パスワード ===
HANDBALL_SUPER_ADMIN_NICKNAME=admin
HANDBALL_SUPER_ADMIN_LOGIN_PASSWORD=管理者用パスワード
TABLE_TENNIS_SUPER_ADMIN_NICKNAME=admin
TABLE_TENNIS_SUPER_ADMIN_LOGIN_PASSWORD=管理者用パスワード

# === LINE Messaging API（オプション）===
TABLE_TENNIS_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN=
TABLE_TENNIS_LINE_MESSAGING_API_TARGET_ID=

# === メール送信（ログイン確認コードの送信に必須）===
ATTENDANCE_REMINDER_EMAIL_API_KEY=
ATTENDANCE_REMINDER_EMAIL_FROM=
RESEND_API_KEY=
EMAIL_FROM=
```

ランダムな文字列の生成例（Linux/Mac）:

```bash
# 32文字のランダム文字列
openssl rand -hex 16

# 64文字のランダム文字列
openssl rand -hex 32
```

#### ステップ4: アプリケーションの起動

```bash
# 初回ビルド（時間がかかります）
docker compose pull
docker compose up -d --build

# Tunnelの起動
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml up -d
```

#### ステップ5: 起動確認

```bash
# 全サービスのステータス確認
docker compose ps

# Tunnelのログ確認
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml logs -f cloudflared

# アプリのログ確認
docker compose logs -f app
```

ブラウザで `https://your-domain.example.com` にアクセスし、部活選択画面が表示されることを確認してください。

### 定期メンテナンス

#### デプロイの更新

```bash
# リポジトリの最新化
cd /opt/toyota_kosen_club_activities
git pull

# 新イメージの取得と再起動
docker compose pull
docker compose up -d --build

# Tunnelの再起動（設定変更時）
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml up -d --force-recreate cloudflared
```

#### ログ確認

```bash
# 全サービスのログ
docker compose logs

# アプリケーションのログ
docker compose logs -f app

# Tunnelのログ
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml logs -f cloudflared

# PostgreSQLのログ
docker compose logs -f postgres
```

#### アプリの停止

```bash
# 全サービス停止（データは保持）
docker compose down

# Tunnelのみ停止
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml down

# 全データ削除（注意！）
docker compose down -v
```

### Cloudflare側の設定

Cloudflareダッシュボードで以下を設定推奨：

- **SSL/TLS**: `Full (strict)`
- **常時HTTPS**: ON
- **HSTS**: ON（`max-age=31536000`, `includeSubDomains`, `preload`）
- **WAF Managed Rules**: ON
- **Bot Fight Mode**: ON
- **Security Level**: `Medium` 以上
- **Cache Rule**: `/auth*`, `/admin*`, `/api/*` を Bypass

### トラブルシューティング

#### ビルドが失敗する

```bash
# キャッシュをクリアして再ビルド
docker compose build --no-cache
docker compose up -d
```

#### Tunnelが接続できない

```bash
# Tunnelログ確認
docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml logs cloudflared

# トークンが正しいか確認
echo $CLOUDFLARE_TUNNEL_TOKEN
```

#### データベースに接続できない

```bash
# DBマイグレーションを手動実行
docker compose exec app npx prisma migrate deploy

# PostgreSQLログ確認
docker compose logs postgres
```

#### メモリ不足

Raspberry Piなどでメモリ不足の場合:

```bash
# ビルド時のメモリ制限を緩和
docker compose build --build-arg BUILD_NODE_OPTIONS=--max-old-space-size=2048 app
docker compose up -d
```

## 既存データを外部DBからローカルへ移す

既存の外部DBデータを引き継ぐ場合は、次のスクリプトを使います。

`scripts/migrate-external-to-local.ps1`

実行例:

```powershell
cd toyota_kosen_club_activities
./scripts/migrate-external-to-local.ps1 `
  -HandballSourceDatabaseUrl "postgresql://USER:PASSWORD@HOST:5432/DBNAME" `
  -TableTennisSourceDatabaseUrl "postgresql://USER:PASSWORD@HOST:5432/DBNAME"
```

このスクリプトは次を行います。

- ローカル PostgreSQL コンテナ起動
- 現在のローカルDBを `backups/before-migration-日時/` にバックアップ
- 外部DBの内容をローカル `handball_notes` / `table_tennis_notes` へ投入

## ローカル開発環境

```bash
cd toyota_kosen_club_activities
docker compose up --build -d
```

アクセス先:

- <http://localhost:3000>

停止:

```bash
docker compose down
```

ログ確認:

```bash
docker compose logs -f app
```

## 環境変数（必要に応じて）

`.env.example` を `.env.tunnel` にコピーして値を設定してください。

### 必須設定項目

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnelトークン | `eyJhIjoi...` |
| `PUBLIC_BASE_URL` | 公開URL | `https://example.com` |
| `POSTGRES_PASSWORD` | PostgreSQLパスワード | 強力なパスワード |
| `HANDBALL_ADMIN_VIEW_KEY` | ハンドボール管理画面キー | ランダム文字列 |
| `TABLE_TENNIS_ADMIN_VIEW_KEY` | 卓球管理画面キー | ランダム文字列 |
| `ATTENDANCE_REMINDER_EMAIL_API_KEY` または `RESEND_API_KEY` | メール送信APIキー（ログイン確認コードの送信に必須） | `re_...` |
| `ATTENDANCE_REMINDER_EMAIL_FROM` または `EMAIL_FROM` | 卓球の送信元メールアドレス（弓道は固定） | `table-tennis@example.com` |
| `HANDBALL_SUPER_ADMIN_LOGIN_PASSWORD` | ハンドボール管理者パスワード | 強力なパスワード |
| `TABLE_TENNIS_SUPER_ADMIN_LOGIN_PASSWORD` | 卓球管理者パスワード | 強力なパスワード |

### オプション設定項目

| 変数名 | 説明 |
|--------|------|
| `TABLE_TENNIS_LINE_MESSAGING_API_CHANNEL_ACCESS_TOKEN` | LINE Messaging APIチャントークン |
| `TABLE_TENNIS_LINE_MESSAGING_API_TARGET_ID` | LINE Messaging API送信先ID |
| `ATTENDANCE_REMINDER_EMAIL_API_KEY` | 出席リマインダーメールAPIキー |
| `ATTENDANCE_REMINDER_EMAIL_FROM` | 送信元メールアドレス |
| `RESEND_API_KEY` | ResendメールAPIキー |
| `EMAIL_FROM` | メール送信元アドレス |

## Cloudflare で有効化を推奨する設定

- SSL/TLS 暗号化モード: `Full (strict)`
- 常時 HTTPS: ON
- HSTS: ON（`max-age=31536000`, `includeSubDomains`, `preload`）
- WAF Managed Rules: ON
- Bot Fight Mode（または Super Bot Fight Mode）: ON
- Security Level: `Medium` 以上
- Browser Integrity Check: ON
- Rate Limiting: `/auth`, `/api/auth/login`, `/api/auth/register` を重点的に制限
- Zero Trust Access（管理画面保護）: `/admin*` 配下へメール認証などを要求
- キャッシュ除外: `/auth*`, `/admin*`, `/api/*` を Cache Rule で Bypass