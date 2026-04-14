# Public Readiness Audit (Phase 1)

## 1) What can stay

- Existing multi-agent architecture (Scout / Spark / Forge / Mirror / Coordinator).
- Discord-first workflow and slash command flow.
- Supabase `bot_storage` key/value persistence model.
- Health server + health monitoring loop.
- Existing deployment artifacts (`Dockerfile`, `docker-compose.yml`, `render.yaml`) as reusable examples.

## 2) What should be renamed or generalised

- Product naming from old internal project name to `AI Support Team`.
- Legacy internal identifier to neutral `ai-support-team` in service labels and docs.
- Package metadata name to public-friendly neutral naming.

## 3) What should move to config or documentation

- Deployment assumptions should be documented as options (Render, Docker, generic Node host), not hard-coded as a single preferred platform.
- Environment variable purpose should be explicitly grouped as required/optional in `.env.example`.

## 4) What still reads as private or project-specific (before cleanup)

- README positioning was platform-specific and tied to a previous private repo.
- Internal docs referenced the previous private repo.
- Health monitor default service label used a legacy internal identifier.
- Compose/render service naming used the old internal project name.
- Legacy backup file `index_backup.js` remained in repo and was not appropriate for public template use.

## 5) What should be improved before public sharing

- Rewrite README for non-expert, artist-friendly onboarding.
- Standardise public naming across package/config/runtime labels.
- Remove stale legacy file(s) and references.
- Keep architecture unchanged while improving clarity, setup, privacy notes, and limitations.
