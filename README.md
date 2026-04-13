# AI Chat Support Group Bot

## 概要

このリポジトリは、Discord 上で **5 bot 構成**（Scout / Spark / Forge / Mirror / Coordinator）で自律会議を回し、タスク整理・意思決定・継続実行を支援する bot 群です。

主な特徴:
- 通常メッセージから新規 task channel を自動生成
- `/starttask`, `/continue`, `/resume`, `/finish` を使った会議運用
- `task_memory` / `user_profile` を Supabase (`bot_storage`) に永続化
- health server (`GET /`, `GET /health`) を `PORT` で待受

---

## セットアップ

### 1) 依存パッケージのインストール

```bash
npm install
```

### 2) `.env` の準備

`.env.example` をコピーして `.env` を作成し、値を埋めてください。

```bash
cp .env.example .env
```

### 3) Supabase テーブル作成

Supabase SQL Editor で以下を実行してください。

```sql
create table if not exists bot_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

### 4) 初回 migration 実行

ローカル JSON（`task_memory.json`, `user_profile.json`）がある場合は、起動前に migration を実行してください。

```bash
node migrate-local-to-supabase.js
```

### 5) 起動

```bash
npm start
```

---

## Supabase SQL

```sql
create table if not exists bot_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

---

## 初回移行手順

1. `task_memory.json` / `user_profile.json` を用意（旧環境からコピー）。
2. `.env` を設定（`SUPABASE_URL`, `SUPABASE_ANON_KEY` を含む）。
3. `node migrate-local-to-supabase.js` を実行。
4. Supabase の `bot_storage` に `task_memory`, `user_profile` が入ったことを確認。
5. 以後、ローカル JSON は本番保存先として使わない（fallback / 手動バックアップ用途のみ）。

---

## Docker / TNAS

### 起動（ビルド込み）

```bash
docker compose up -d --build
```

### ログ確認

```bash
docker compose logs -f
```

### 停止

```bash
docker compose down
```

### 再起動

```bash
docker compose restart
```

`docker-compose.yml` はローカル JSON を永続 volume としてマウントしていません。通常永続化は Supabase のみを使用します。

---

## トラブルシュート

### 1) env が足りない
- 起動時に `Missing required env vars.` で終了します。
- `.env` の必須キー（特に Discord 各 token / client id、Supabase、API keys）を確認してください。

### 2) Discord login 失敗
- token / client id の取り違え、Bot 権限不足、Guild 設定ミスを確認。
- Discord Developer Portal で Intent 設定（Message Content 含む）を確認。

### 3) Supabase 接続失敗
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` の値とテーブル作成有無を確認。
- RLS を有効にしている場合は、`bot_storage` への読み書きポリシーを確認。

### 4) Notion / Tavily / Groq 失敗
- 各 API key の期限切れ、権限不足、レート制限を確認。
- 一時障害時は bot は継続し、ログにエラー出力されます。

### 5) port 10000 使用中
- `PORT` を変更するか、使用中プロセスを停止して再起動してください。
- Docker 利用時は `docker-compose.yml` の ports 設定も合わせて変更してください。
