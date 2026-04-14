# AI Support Team

AI Support Team is an open, reusable multi-agent support system for independent artists and small creative teams.

It helps turn everyday Discord messages into structured support workflows for admin, research, planning, drafting, coordination, and creative operations.

## Who this is for

- dancers
- choreographers
- musicians
- theatre makers
- visual artists
- producers
- interdisciplinary artists
- small collectives
- small arts organisations

## What it helps with

- turning ideas or requests into actionable task channels
- coordinating role-based AI support across multiple specialist agents
- drafting outlines, summaries, and next-step plans
- maintaining shared task memory and user profile context
- tracking service health for long-running operations

## Architecture (current, lightweight)

This repo keeps the existing architecture and agent roles:

- **Scout**: gathers and checks context
- **Spark**: proposes ideas and directions
- **Forge**: develops practical output
- **Mirror**: critiques and reflects
- **Coordinator**: routes, decides next step, and posts final summary

Core flow:

1. Discord message or slash command starts/resumes a task.
2. Coordinator orchestrates multi-agent turns.
3. Task state/history are persisted in Supabase (`bot_storage`).
4. Health server exposes `GET /`, `GET /health`, `GET /ready`.

## Required services / accounts

You need:

- a Discord server (guild) you can manage
- 5 Discord bot applications (Scout, Spark, Forge, Mirror, Coordinator)
- Groq API key
- Tavily API key
- Notion API key
- Supabase project (table: `bot_storage`)

Optional:

- Discord webhook URL for health/crash alerts
- Render (or any Node.js host) for deployment
- Docker-compatible host for container deployment

## Environment variables

Copy `.env.example` to `.env` and fill required values.

Required groups:

- Discord IDs/tokens for all 5 agents
- External API keys: `GROQ_API_KEY`, `TAVILY_API_KEY`, `NOTION_KEY`
- Storage: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

Optional groups:

- `TASK_ADMIN_ROLE_ID`
- `PORT`
- health alert/monitor tuning vars

See `.env.example` for full details and defaults.

## Local setup

```bash
npm install
cp .env.example .env
npm start
```

### Supabase table setup

```sql
create table if not exists bot_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

### Optional migration from local JSON files

```bash
npm run migrate:supabase
```

This reads `task_memory.json` / `user_profile.json` only if they exist.

## Deployment options

### Option A: Render

Use `render.yaml` as a baseline, or configure manually:

- Build command: `npm install --omit=dev`
- Start command: `npm run render-start` (or `npm start`)
- Health check path: `/health`

### Option B: Docker / docker-compose

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

### Option C: Any Node.js host

Any host that supports long-running Node processes and environment variables can run this project.

## Customising for another artist or team

You can adapt this template without changing core architecture:

- edit prompt files under `src/agents/**/prompts.js`
- adjust slash command workflows in `src/discord/**`
- tune orchestration rules in `src/orchestration/**`
- set role access rules with `TASK_ADMIN_ROLE_ID`
- update deployment metadata (`render.yaml`, compose service name) to your own project name

## Privacy and security notes

- Never commit `.env` or real API keys/tokens.
- Keep Discord bot permissions minimal for your use case.
- Restrict Supabase policies appropriately if using RLS.
- Health alerts can include operational metadata (service state, uptime); send only to trusted channels.

## Current limitations

- Requires 5 bot tokens/client IDs (setup effort is non-trivial).
- No built-in web UI; operations are Discord-first.
- Supabase schema is intentionally minimal (`bot_storage` key/value model).
- If required env vars are missing, startup exits immediately.

## Troubleshooting quick notes

- `Missing required env vars.` → check `.env` against `.env.example`.
- Supabase connection errors → verify URL/key/table/policies.
- Discord login issues → verify token/client ID pairing, bot invite permissions, intents.
- Slash command registration issues → verify `COORDINATOR_CLIENT_ID` and `DISCORD_GUILD_ID`.
