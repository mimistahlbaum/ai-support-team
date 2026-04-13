# Codex refactor brief part 1

Repository: `mimistahlbaum/ai-chat-support-group`  
Base branch: `main`

## Goal

Do the safest first-stage refactor of the monolithic `index.js` without changing runtime behaviour.

This part should only cover:

1. pure utilities
2. constants and env loading
3. Discord send helpers
4. channel creation helpers
5. external service wrappers

Do **not** touch the main orchestration flow yet.  
Do **not** move Discord event handlers yet.  
Do **not** redesign storage.

## Important constraints

- Keep runtime behaviour identical
- Keep all current env variable names
- Keep current Docker behaviour
- Keep the current health server later untouched
- Do not change slash command behaviour
- Do not change task flow behaviour
- Do not redesign Supabase storage
- Do not remove any features
- Prefer tiny safe moves

## Scope

### Step 1: extract constants and env

Create:

- `src/app/constants.js`
- `src/app/env.js`

Move:

- all runtime constants
- env variable loading and validation logic

Keep the exported values identical to current runtime expectations.

### Step 2: extract pure utils

Create:

- `src/utils/time.js`
- `src/utils/text.js`
- `src/utils/errors.js`
- `src/utils/timeout.js`
- `src/utils/retry.js`
- `src/utils/ids.js`

Move:

- `nowIso`
- `sleep`
- `clip`
- `formatError`
- `splitLongText`
- `withTimeout`
- `retryAsync`
- `makeRunId`

Keep behaviour identical.

### Step 3: extract Discord send and channel helpers

Create:

- `src/discord/send-message.js`
- `src/discord/channel-factory.js`

Move:

- `getChannel`
- `sendAsBot`
- `safeCoordinatorStop`
- `safeChannelName`
- `buildTaskChannelOverwrites`
- `createTaskChannel`

Keep the same permission overwrite logic and naming rules.

### Step 4: extract external service wrappers

Create:

- `src/services/llm/groq-client.js`
- `src/services/llm/ask-groq.js`
- `src/services/llm/safe-json.js`
- `src/services/search/notion-client.js`
- `src/services/search/notion-search.js`
- `src/services/search/tavily-search.js`
- `src/services/storage/supabase-client.js`

Move:

- groq client init
- notion client init
- supabase client init
- `askGroq`
- `safeJsonFromGroq`
- `notionSearch`
- `formatNotionSearchResults`
- `searchTavily`

Keep request timeouts, retries and return shapes identical.

## Deliverables

- modular files added
- root runtime still boots
- imports updated cleanly
- no feature changes

## Testing checklist

1. app boots with `npm start`
2. no import errors
3. existing runtime still starts normally
4. no env name changes
5. service wrappers still return the same shapes as before

## Notes

- Avoid circular imports
- Prefer named exports
- If needed, keep small compatibility wrappers temporarily
- Do not move `executeMeetingRun`, `enqueueMeetingRun`, `interactionCreate`, or `messageCreate` yet
