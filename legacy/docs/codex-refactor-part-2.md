# Codex refactor brief part 2

Repository: `mimistahlbaum/ai-support-team`
Base branch: `main`

## Goal

Do the second-stage refactor of the monolithic `index.js` without changing runtime behaviour.

This part should only cover:

1. runtime state extraction
2. task and history helpers
3. persistence extraction
4. prompt extraction
5. routing and agent decision helpers

Do **not** move the main orchestration loop yet.
Do **not** move Discord event handlers yet.
Do **not** redesign storage schema yet.

## Important constraints

- Keep runtime behaviour identical
- Keep all current env variable names
- Keep current slash commands unchanged
- Keep Supabase key-value storage unchanged
- Keep migration fallback JSON behaviour unchanged
- Keep manual backup behaviour unchanged
- Do not redesign the system yet
- Prefer safe file moves over rewrites

## Scope

### Step 1: extract runtime state

Create:

- `src/state/runtime-state.js`
- `src/state/in-memory-run-queue.js`

Move:

- `userProfile`
- `taskMemory`
- `saveState`
- `channelRunState`
- `isShuttingDown`
- `getRunState`

Keep in-memory behaviour identical.

### Step 2: extract domain helpers

Create:

- `src/domain/task-model.js`
- `src/domain/history-model.js`
- `src/domain/decision-model.js`
- `src/orchestration/derive-state.js`
- `src/orchestration/context-builders.js`

Move:

- `touchTask`
- `normalizeTask`
- `upsertNormalizedTask`
- `ensureTask`
- `getTask`
- `appendHistory`
- `addDecision`
- `setOpenQuestions`
- `setNextActions`
- `deriveListsFromTurn`
- `buildHistoryContext`
- `buildUserProfileContext`
- `taskTypeHint`

Keep all object shapes and side effects identical.

### Step 3: extract persistence logic

Create:

- `src/services/storage/task-repository.js`
- `src/services/storage/user-profile-repository.js`
- `src/services/storage/backup-files.js`
- `src/services/storage/migration-fallback.js`

Move:

- `serializeTaskMemory`
- `saveTaskMemorySupabase`
- `writeManualBackups`
- `flushTaskMemory`
- `scheduleTaskMemorySave`
- `loadTaskMemory`
- `loadUserProfile`
- `saveUserProfile`

Important:

- Keep current Supabase key-value storage behaviour exactly as-is
- Keep fallback JSON loading exactly as-is
- Keep manual backup writes exactly as-is
- Do not introduce relational tables yet

### Step 4: extract prompts

Create:

- `src/agents/coordinator/prompts.js`
- `src/agents/scout/prompts.js`
- `src/agents/spark/prompts.js`
- `src/agents/forge/prompts.js`
- `src/agents/mirror/prompts.js`

Move:

- `sparkSystem`
- `forgeSystem`
- `mirrorSystem`
- `coordinatorSystem`

Keep prompt content functionally equivalent.

### Step 5: extract routing and agent decision helpers

Create:

- `src/agents/coordinator/decide-next-step.js`
- `src/agents/coordinator/final-summary.js`
- `src/agents/scout/judge-search.js`
- `src/agents/spark/run-spark.js`
- `src/agents/forge/run-forge.js`
- `src/agents/mirror/run-mirror.js`
- `src/agents/run-agent-response.js`
- `src/orchestration/routing.js`
- `src/orchestration/update-history-summary.js`

Move:

- `askScoutSearchDecision`
- `askCoordinatorNextStep`
- `askCoordinatorFinalSummary`
- `askAgentResponse`
- `shouldAutoRespond`
- `classifyTaskType`
- `updateHistorySummary`

Keep all return shapes identical.

## Deliverables

- modular state, storage and routing files added
- root runtime still boots
- no behaviour changes
- storage still works exactly as before

## Testing checklist

1. app boots with `npm start`
2. task state still saves to Supabase
3. fallback JSON loading still works
4. manual backups still write correctly
5. routing decisions still return the same JSON shapes
6. no slash command behaviour changes
7. no normal message routing regressions caused by imports

## Notes

- Avoid circular imports, especially between state, storage and orchestration
- Prefer named exports
- If needed, keep thin compatibility wrappers temporarily
- Do not move `enqueueMeetingRun`, `executeMeetingRun`, `runResume`, `interactionCreate`, or `messageCreate` yet
