# Codex refactor brief part 3

Repository: `mimistahlbaum/ai-chat-support-group`
Base branch: `main`

## Goal

Do the final-stage modular refactor of the monolithic `index.js` without changing runtime behaviour.

This part should cover:

1. orchestration extraction
2. Discord handler extraction
3. bootstrap extraction
4. thin entry point creation

This is the riskiest part.
Move carefully and preserve the current workflow exactly.

## Important constraints

- Keep runtime behaviour identical
- Keep all slash commands unchanged
- Keep current task channel workflow unchanged
- Keep current autonomous meeting loop unchanged
- Keep current stop-on-provider-failure behaviour unchanged
- Keep current health server and graceful shutdown unchanged
- Do not redesign the system yet
- Do not change persistence semantics
- Prefer minimal safe moves

## Scope

### Step 1: extract orchestration

Create:

- `src/orchestration/enqueue-run.js`
- `src/orchestration/execute-run.js`
- `src/orchestration/resume-run.js`

Move:

- `enqueueMeetingRun`
- `executeMeetingRun`
- `runResume`

Important:

- Preserve queue behaviour exactly
- Preserve current `MAX_DYNAMIC_TURNS` behaviour
- Preserve provider failure stop behaviour
- Preserve coordinator summary behaviour
- Preserve immediate save calls at the same decision points

### Step 2: extract Discord client and command wiring

Create:

- `src/discord/coordinator-client.js`
- `src/discord/register-commands.js`
- `src/discord/runtime-handlers.js`

Move:

- Discord client creation
- `registerCoordinatorCommands`
- `attachClientRuntimeHandlers`
- ready handlers

Keep current login and registration behaviour intact.

### Step 3: extract task creation and handlers

Create:

- `src/discord/auto-create-task.js`
- `src/discord/interaction-handler.js`
- `src/discord/message-handler.js`

Move:

- `autoCreateTaskFromMessage`
- `interactionCreate` handler
- `messageCreate` handler

Important:

- `/starttask` must still create a task channel
- `/continue` must still continue the autonomous flow
- `/resume` must still restore from saved memory
- `/finish` must still clear the task
- normal message auto-routing must still work

### Step 4: extract app bootstrap

Create:

- `src/app/health-server.js`
- `src/app/bootstrap.js`
- `src/index.js`

Move:

- health server setup
- `loginBot`
- `gracefulShutdown`
- signal handlers
- startup bootstrap block

End state:

- `src/index.js` should be a thin entry point
- if needed, root `index.js` can remain as a tiny compatibility entry that imports `./src/index.js`
- keep `package.json` runtime behaviour compatible with current `npm start`

## Deliverables

- orchestration extracted into modules
- Discord handlers extracted into modules
- bootstrap extracted into modules
- root entry point becomes thin
- no feature removals
- no behaviour changes

## Testing checklist

1. `npm start` boots successfully
2. health endpoint returns `ok`
3. slash commands still register
4. `/starttask` creates a task channel
5. `/continue` resumes autonomous discussion
6. `/resume` restores from saved memory
7. `/finish` clears the task
8. normal message auto-task creation still works
9. graceful shutdown flushes task memory and backups
10. no event handler import or binding regressions

## Notes

- This is the highest-risk part of the refactor
- Keep the smallest possible diff for event wiring
- Preserve event registration order where relevant
- Prefer thin wrapper functions over rewriting logic
- If necessary, keep temporary compatibility glue until the app is fully stable
