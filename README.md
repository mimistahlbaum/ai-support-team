# AI Chat Support Group Bot

5 bot 構成（Scout / Spark / Forge / Mirror / Coordinator）で Discord 内の相談を自律会議に変換し、タスク実行まで進める bot です。通常運用時の永続化先は **Supabase (`bot_storage`) のみ** です。

- task channel 自動生成（通常メッセージ起点）
- `/starttask`, `/continue`, `/resume`, `/finish`
- 永続化キー: `task_memory`, `user_profile`
- `GET /` と `GET /health` の health endpoint を `PORT` で公開

---

## Render での運用（最優先）

### Render Web Service 設定

- **Repository**: `mimistahlbaum/ai-chat-support-group`
- **Branch**: `main`
- **Root Directory**: リポジトリルート（空欄）
- **Build Command**: `npm install --omit=dev`
- **Start Command**: `npm run render-start`（`npm start` でも可）
- **Health Check Path**: `/health`

### 必須 Environment Variables

`.env.example` の必須項目を Render の Environment に設定してください。

- `DISCORD_GUILD_ID`
- `SCOUT_BOT_TOKEN`, `SCOUT_CLIENT_ID`
- `SPARK_BOT_TOKEN`, `SPARK_CLIENT_ID`
- `FORGE_BOT_TOKEN`, `FORGE_CLIENT_ID`
- `MIRROR_BOT_TOKEN`, `MIRROR_CLIENT_ID`
- `COORDINATOR_BOT_TOKEN`, `COORDINATOR_CLIENT_ID`
- `GROQ_API_KEY`
- `TAVILY_API_KEY`
- `NOTION_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

任意:
- `TASK_ADMIN_ROLE_ID`（task channel 追加アクセス制御）
- `PORT`（Render では通常自動設定。ローカル既定値は `10000`）

### Render の sleep / restart 後の挙動

- アプリ起動時に Supabase から `task_memory` / `user_profile` を再読込します。
- Supabase 読込に失敗した場合のみ migration fallback (`task_memory.json`, `user_profile.json`) を試します。
- Discord 接続断が起きても shard イベントをログ出しし、再接続の状態を追えるようにしています。

---

## Supabase

### 1) `bot_storage` テーブル作成 SQL

```sql
create table if not exists bot_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

### 2) ローカル JSON から migration

```bash
npm run migrate:supabase
```

- `task_memory.json` / `user_profile.json` が存在する場合のみ読み込みます。
- Supabase 側に既存キーがある場合は上書き警告を表示します。

### 3) JSON ファイルの役割（通常運用では非メイン）

- `task_memory.json` / `user_profile.json`: **migration fallback 読み込み専用**
- `task_memory.backup.json` / `user_profile.backup.json`: **manual backup 書き込み先**
- 通常の保存先は Supabase のみ

---

## ローカル開発

```bash
npm install
cp .env.example .env
npm start
```

---

## Docker / TNAS（参考情報）

本リポジトリには `Dockerfile` / `docker-compose.yml` を残していますが、**現行の第一運用は Render** です。Docker/TNAS は参考・将来用の位置づけです。

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

---

## Troubleshooting

### Missing required env vars

起動時に `Missing required env vars.` が出る場合、必須 env の未設定です。Render 環境変数または `.env` を再確認してください。

### Supabase 接続失敗

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` を確認
- `bot_storage` テーブル作成済みか確認
- RLS 利用時は `select` / `upsert` を許可する policy を確認

### Discord login 失敗

- Bot token / client id の組み合わせミス
- Bot 招待・権限・Intent（特に Message Content）不足
- 起動ログの `fatal error` / bot 名付き login エラーを確認

### slash commands registration failure

- `COORDINATOR_CLIENT_ID` / `DISCORD_GUILD_ID` の不一致
- Discord API 一時エラー（起動中に retry 実施）
- 失敗時も bot 本体は継続起動（ログで確認可能）

### Render sleep / restart 後に反応が不安定

- Render の再起動直後は Discord 再接続完了まで数秒〜数十秒かかる場合があります。
- `/health` が `ok` でも、Discord 側 ready ログが出るまで待ってください。
