import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Client as NotionClient } from '@notionhq/client';

// =========================================================
// env / client init
// =========================================================

const {
  DISCORD_GUILD_ID,

  SCOUT_BOT_TOKEN,
  SCOUT_CLIENT_ID,

  SPARK_BOT_TOKEN,
  SPARK_CLIENT_ID,

  FORGE_BOT_TOKEN,
  FORGE_CLIENT_ID,

  MIRROR_BOT_TOKEN,
  MIRROR_CLIENT_ID,

  COORDINATOR_BOT_TOKEN,
  COORDINATOR_CLIENT_ID,

  GROQ_API_KEY,
  TAVILY_API_KEY,
  NOTION_KEY,

  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TASK_ADMIN_ROLE_ID,
} = process.env;

if (
  !DISCORD_GUILD_ID ||
  !SCOUT_BOT_TOKEN ||
  !SCOUT_CLIENT_ID ||
  !SPARK_BOT_TOKEN ||
  !SPARK_CLIENT_ID ||
  !FORGE_BOT_TOKEN ||
  !FORGE_CLIENT_ID ||
  !MIRROR_BOT_TOKEN ||
  !MIRROR_CLIENT_ID ||
  !COORDINATOR_BOT_TOKEN ||
  !COORDINATOR_CLIENT_ID ||
  !GROQ_API_KEY ||
  !TAVILY_API_KEY ||
  !NOTION_KEY ||
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY
) {
  console.error('Missing required env vars.');
  process.exit(1);
}

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const notion = new NotionClient({ auth: NOTION_KEY });

const scout = new Client({ intents: [GatewayIntentBits.Guilds] });
const spark = new Client({ intents: [GatewayIntentBits.Guilds] });
const forge = new Client({ intents: [GatewayIntentBits.Guilds] });
const mirror = new Client({ intents: [GatewayIntentBits.Guilds] });
const coordinator = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =========================================================
// constants
// =========================================================

const PORT = process.env.PORT || 10000;
const DISCORD_SAFE_LIMIT = 1800;
const MAX_DYNAMIC_TURNS = 6;
const TEXT_MODEL = 'llama-3.1-8b-instant';
const JSON_MODEL = 'llama-3.1-8b-instant';

const MIGRATION_FALLBACK_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.json');
const MIGRATION_FALLBACK_PROFILE_FILE = path.join(process.cwd(), 'user_profile.json');
const MANUAL_BACKUP_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.backup.json');
const MANUAL_BACKUP_PROFILE_FILE = path.join(process.cwd(), 'user_profile.backup.json');

const REQUEST_TIMEOUT_MS = 12000;
const SEND_TIMEOUT_MS = 8000;
const API_RETRIES = 2;
const SEND_RETRIES = 2;
const SAVE_DEBOUNCE_SUPABASE_MS = 5000;

// =========================================================
// runtime storage
// =========================================================

let userProfile = {};
const taskMemory = new Map();

const saveState = {
  supabaseTimer: null,
  pendingSupabase: false,
};

const channelRunState = new Map();
let isShuttingDown = false;

// =========================================================
// utils
// =========================================================

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clip(text, max = 500) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)} ...` : text;
}

function formatError(error) {
  return error?.stack || error?.message || String(error);
}

function splitLongText(text, maxLength = DISCORD_SAFE_LIMIT) {
  if (!text) return ['(no response)'];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);
    if (splitAt < 500) splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < 300) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt < 100) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

function safeChannelName(title) {
  const base = String(title || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

  const cleaned = base
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const isUsable = cleaned && /[\p{L}\p{N}]/u.test(cleaned);
  if (isUsable) return `task-${cleaned}`.slice(0, 95);

  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `task-${ts}`;
}

function isLikelyTrivialMessage(content) {
  const text = String(content || '').trim();
  if (!text) return true;
  if (text.length <= 2) return true;

  const lower = text.toLowerCase();
  const trivial = new Set([
    'ok',
    'okay',
    'thanks',
    'thank you',
    'thx',
    '了解',
    'ありがとう',
    'いいね',
    'yes',
    'no',
    'k',
  ]);
  if (trivial.has(lower)) return true;

  const emojiOnly = /^[\p{Emoji}\p{Extended_Pictographic}\s]+$/u.test(text);
  if (emojiOnly) return true;

  const urlOnly = /^(https?:\/\/\S+\s*)+$/i.test(text);
  if (urlOnly) return true;

  if (/^(lol|lmao|w+|草)+$/i.test(lower)) return true;
  return false;
}

function isProviderFailureText(text) {
  const msg = String(text || '').toLowerCase();
  return (
    msg.includes('groq error:') ||
    msg.includes('scout error:') ||
    msg.includes('notion error:') ||
    msg.includes('model temporarily unavailable') ||
    msg.includes('provider unavailable')
  );
}

function withTimeout(promiseFactory, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);

    Promise.resolve()
      .then(() => promiseFactory())
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function retryAsync(fn, { retries = 2, delayMs = 500, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt > retries) break;
      console.warn(`${label} attempt ${attempt} failed: ${error.message}`);
      await sleep(delayMs * attempt);
    }
  }

  throw new Error(`${label} failed after retries: ${lastError?.message || 'unknown'}`);
}

function makeRunId(channelId) {
  return `${channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function touchTask(task, updates = {}) {
  const canonical =
    typeof task === 'string'
      ? taskMemory.get(task)
      : taskMemory.get(task?.channelId) || task;

  if (!canonical) return;

  Object.assign(canonical, updates);
  canonical.lastUpdatedAt = nowIso();
  scheduleTaskMemorySave();
}

function normalizeTask(task, fallback = {}) {
  const base = {
    taskType: 'general',
    title: '',
    originalTitle: '',
    prompt: '',
    scoutEvidence: '',
    summary: '',
    historySummary: '',
    lastExecution: '',
    cycleCount: 0,
    channelId: '',
    history: [],
    status: 'idle',
    activeSpeaker: 'none',
    runId: '',
    lastUpdatedAt: nowIso(),
    openQuestions: [],
    nextActions: [],
    decisionLog: [],
    ...fallback,
    ...task,
  };

  base.history = Array.isArray(base.history) ? base.history : [];
  base.openQuestions = Array.isArray(base.openQuestions) ? base.openQuestions : [];
  base.nextActions = Array.isArray(base.nextActions) ? base.nextActions : [];
  base.decisionLog = Array.isArray(base.decisionLog) ? base.decisionLog : [];

  return base;
}

function upsertNormalizedTask(channelId, partialTask, fallback = {}) {
  const normalized = normalizeTask(partialTask, fallback);
  taskMemory.set(channelId, normalized);
  return normalized;
}

// =========================================================
// persistence
// =========================================================

function serializeTaskMemory() {
  return Object.fromEntries(taskMemory);
}

async function saveTaskMemorySupabase() {
  const data = serializeTaskMemory();
  const { error } = await retryAsync(
    () => withTimeout(
      () => supabase.from('bot_storage').upsert({
        key: 'task_memory',
        value: data,
        updated_at: nowIso(),
      }),
      REQUEST_TIMEOUT_MS,
      'supabase upsert task_memory'
    ),
    { retries: API_RETRIES, label: 'save task memory to supabase' }
  );

  if (error) {
    throw new Error(error.message || 'unknown supabase error');
  }
}

function writeManualBackups() {
  try {
    fs.writeFileSync(
      MANUAL_BACKUP_TASK_MEMORY_FILE,
      JSON.stringify(serializeTaskMemory(), null, 2),
      'utf8'
    );
    fs.writeFileSync(
      MANUAL_BACKUP_PROFILE_FILE,
      JSON.stringify(userProfile, null, 2),
      'utf8'
    );
    console.log('Manual backup files updated.');
  } catch (error) {
    console.error('Failed to write manual backup files:', formatError(error));
  }
}

async function flushTaskMemory({ local = false, supabase: remote = true } = {}) {
  try {
    if (local) writeManualBackups();
    if (remote) await saveTaskMemorySupabase();
  } catch (error) {
    console.error('flushTaskMemory failed:', formatError(error));
  }
}

function scheduleTaskMemorySave({ local = false, supabase: remote = true, immediate = false } = {}) {
  if (immediate) {
    if (saveState.supabaseTimer) clearTimeout(saveState.supabaseTimer);
    saveState.supabaseTimer = null;
    saveState.pendingSupabase = false;
    void flushTaskMemory({ local, supabase: remote });
    return;
  }

  if (local) {
    console.warn('local task memory save requested explicitly (migration/manual backup mode).');
    void flushTaskMemory({ local: true, supabase: false });
  }

  if (remote) {
    saveState.pendingSupabase = true;
    if (saveState.supabaseTimer) clearTimeout(saveState.supabaseTimer);
    saveState.supabaseTimer = setTimeout(() => {
      saveState.supabaseTimer = null;
      if (!saveState.pendingSupabase) return;
      saveState.pendingSupabase = false;
      void saveTaskMemorySupabase().catch(error => {
        console.error('supabase task memory save failed:', formatError(error));
      });
    }, SAVE_DEBOUNCE_SUPABASE_MS);
  }
}

async function loadTaskMemory() {
  try {
    const { data, error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').select('value').eq('key', 'task_memory').maybeSingle(),
        REQUEST_TIMEOUT_MS,
        'supabase load task_memory'
      ),
      { retries: API_RETRIES, label: 'load task memory from supabase' }
    );

    if (!error && data?.value) {
      taskMemory.clear();
      for (const [key, value] of Object.entries(data.value)) {
        taskMemory.set(key, normalizeTask(value));
      }
      console.log(`Loaded ${taskMemory.size} task memories from Supabase.`);
      return;
    }

    if (error) {
      console.warn(`Supabase task_memory load failed; using migration fallback if available: ${error.message}`);
    } else {
      console.warn('Supabase task_memory not found; using migration fallback if available.');
    }

    if (!fs.existsSync(MIGRATION_FALLBACK_TASK_MEMORY_FILE)) return;
    const raw = fs.readFileSync(MIGRATION_FALLBACK_TASK_MEMORY_FILE, 'utf8');
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    taskMemory.clear();
    for (const [key, value] of Object.entries(parsed)) {
      taskMemory.set(key, normalizeTask(value));
    }
    console.log(`Loaded ${taskMemory.size} task memories from migration fallback JSON.`);
  } catch (error) {
    console.error('Failed to load task memory:', formatError(error));
  }
}

async function loadUserProfile() {
  try {
    const { data, error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').select('value').eq('key', 'user_profile').maybeSingle(),
        REQUEST_TIMEOUT_MS,
        'supabase load user_profile'
      ),
      { retries: API_RETRIES, label: 'load user profile from supabase' }
    );

    if (!error && data?.value) {
      userProfile = data.value;
      console.log('Loaded user profile from Supabase.');
      return;
    }

    if (error) {
      console.warn(`Supabase user_profile load failed; using migration fallback if available: ${error.message}`);
    } else {
      console.warn('Supabase user_profile not found; using migration fallback if available.');
    }

    if (!fs.existsSync(MIGRATION_FALLBACK_PROFILE_FILE)) {
      userProfile = {};
      return;
    }

    const raw = fs.readFileSync(MIGRATION_FALLBACK_PROFILE_FILE, 'utf8');
    userProfile = raw.trim() ? JSON.parse(raw) : {};
    console.log('Loaded user profile from migration fallback JSON.');
  } catch (error) {
    console.error('Failed to load user profile:', formatError(error));
    userProfile = {};
  }
}

async function saveUserProfile() {
  try {
    const { error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').upsert({ key: 'user_profile', value: userProfile, updated_at: nowIso() }),
        REQUEST_TIMEOUT_MS,
        'save user profile'
      ),
      { retries: API_RETRIES, label: 'save user profile to supabase' }
    );

    if (error) {
      console.error('Failed to save user profile to Supabase:', error.message);
    }
  } catch (error) {
    console.error('Failed to save user profile:', formatError(error));
  }
}

// =========================================================
// task state / run queue
// =========================================================

function ensureTask(channelId, taskType, title, prompt) {
  const existing = taskMemory.get(channelId);
  if (existing) return existing;

  const task = upsertNormalizedTask(channelId, {
    taskType,
    title,
    originalTitle: title,
    prompt,
    channelId,
    status: 'idle',
  });
  scheduleTaskMemorySave();
  return task;
}

function getTask(channelId) {
  return taskMemory.get(channelId);
}

function appendHistory(channelId, role, mode, content) {
  const task = taskMemory.get(channelId);
  if (!task) return;

  task.history.push({ role, mode, content, timestamp: nowIso() });
  if (task.history.length > 120) task.history = task.history.slice(-120);

  task.lastUpdatedAt = nowIso();
  scheduleTaskMemorySave();
}

function addDecision(task, item) {
  task.decisionLog.push({ ...item, timestamp: nowIso() });
  if (task.decisionLog.length > 80) task.decisionLog = task.decisionLog.slice(-80);
}

function setOpenQuestions(task, items) {
  task.openQuestions = (Array.isArray(items) ? items : []).slice(0, 20);
}

function setNextActions(task, items) {
  task.nextActions = (Array.isArray(items) ? items : []).slice(0, 20);
}

function deriveListsFromTurn(task, next, latestUserPrompt) {
  if (next.taskComplete) {
    setOpenQuestions(task, []);
    setNextActions(task, []);
    return;
  }

  const q = [];
  if (next.reason.includes('未決定') || next.reason.toLowerCase().includes('unknown')) {
    q.push(next.reason);
  }
  if (latestUserPrompt.includes('?') || latestUserPrompt.includes('？')) {
    q.push(clip(latestUserPrompt, 140));
  }

  const actions = [];
  if (next.nextInstruction) actions.push(clip(next.nextInstruction, 220));
  actions.push(`${next.nextSpeaker} to proceed in ${next.mode} mode`);

  setOpenQuestions(task, Array.from(new Set([...task.openQuestions, ...q])).slice(-10));
  setNextActions(task, Array.from(new Set(actions)).slice(-10));
}

function getRunState(channelId) {
  if (!channelRunState.has(channelId)) {
    channelRunState.set(channelId, { running: false, queue: [] });
  }
  return channelRunState.get(channelId);
}

async function enqueueMeetingRun(channel, latestUserPrompt, invocationMode) {
  const state = getRunState(channel.id);
  const payload = { latestUserPrompt, invocationMode };

  if (state.running) {
    state.queue.push(payload);
    await sendAsBot(
      coordinator,
      channel.id,
      `別の実行が進行中のためキューに追加しました。queue=${state.queue.length}`,
      'Coordinator'
    );
    return;
  }

  state.running = true;

  try {
    let current = payload;
    while (current) {
      await executeMeetingRun(channel, current.latestUserPrompt, current.invocationMode);
      current = state.queue.shift();
    }
  } finally {
    state.running = false;
  }
}

// =========================================================
// context builders / routing
// =========================================================

function buildHistoryContext(channelId, maxItems = 10) {
  const task = taskMemory.get(channelId);
  if (!task || !Array.isArray(task.history) || task.history.length === 0) {
    return 'No prior history.';
  }

  return task.history
    .slice(-maxItems)
    .map((item, index) => [
      `History ${index + 1}`,
      `Role: ${item.role}`,
      `Mode: ${item.mode}`,
      `Content: ${clip(item.content, 700)}`,
    ].join('\n'))
    .join('\n\n');
}

function buildUserProfileContext() {
  if (!userProfile || Object.keys(userProfile).length === 0) return 'No user profile available.';
  return JSON.stringify(userProfile, null, 2);
}

function taskTypeHint(taskType) {
  const hints = {
    general: '一般的な相談、整理、方向性設計、実務補助として扱ってください。',
    research: '研究テーマ、文献、理論枠組み、方法論、研究計画、論理構成を重視してください。',
    grant: '助成金、公募、申請文、審査視点、締切、要件、実現可能性を重視してください。',
    website: 'Webサイト、情報設計、掲載内容、導線、ブランド表現、構成を重視してください。',
    marketing: '発信戦略、ターゲット、訴求角度、投稿案、導線を重視してください。',
    admin: '事務処理、テンプレート、手順、抜け漏れ防止、実務整理を重視してください。',
  };
  return hints[taskType] || hints.general;
}

async function shouldAutoRespond(message) {
  const content = message.content?.trim();
  if (!content) return { shouldRespond: false, reason: 'empty', isNewTask: false };

  const channelName = message.channel?.name || '';

  if (channelName.startsWith('task-')) {
    const commandLike =
      content === '!run' ||
      content === '!continue' ||
      content.startsWith('!run ') ||
      content.startsWith('!continue ');
    return {
      shouldRespond: commandLike,
      reason: commandLike ? 'task command message' : 'task channel requires !run/!continue',
      isNewTask: false,
    };
  }

  if (isLikelyTrivialMessage(content)) {
    return { shouldRespond: false, reason: 'trivial prefilter', isNewTask: false };
  }

  const systemPrompt = `
あなたは Discord Auto Router です。
役割は、このメッセージが「botチームに依頼して処理すべき内容」か判断することです。

ルール:
- 雑談、独り言、短い相槌、感想なら shouldRespond = false
- 相談、依頼、質問、作業、整理、情報収集、計画、文章作成なら shouldRespond = true
- 新しい task チャンネルを作る必要がありそうなら isNewTask = true
- 必ず JSON だけ返す

形式:
{
  "shouldRespond": true,
  "reason": "short reason",
  "isNewTask": true
}
`;

  const userPrompt = `
channel:
${channelName}

message:
${content}

userProfile:
${buildUserProfileContext()}
`;

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, {
    shouldRespond: false,
    reason: 'fallback ignore',
    isNewTask: false,
  });

  return {
    shouldRespond: Boolean(parsed.shouldRespond),
    reason: parsed.reason || 'No reason',
    isNewTask: Boolean(parsed.isNewTask),
  };
}

async function classifyTaskType(messageContent) {
  const systemPrompt = `
あなたは Task Type Router です。
役割は、ユーザーの依頼を最も適切な taskType に分類することです。

選べる taskType:
- research
- grant
- website
- marketing
- admin
- general

必ず JSON だけ返してください。
`;

  const userPrompt = `
message:
${messageContent}

userProfile:
${buildUserProfileContext()}
`;

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, {
    taskType: 'general',
    reason: 'fallback general',
  });

  const allowed = ['research', 'grant', 'website', 'marketing', 'admin', 'general'];
  return {
    taskType: allowed.includes(parsed.taskType) ? parsed.taskType : 'general',
    reason: parsed.reason || 'No reason',
  };
}

// =========================================================
// llm / external calls
// =========================================================

async function askGroq(systemPrompt, userPrompt, options = {}) {
  const { model = TEXT_MODEL, temperature = 0.6, max_tokens = 900 } = options;

  try {
    const response = await retryAsync(
      () => withTimeout(
        () => groq.chat.completions.create({
          model,
          temperature,
          max_tokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        REQUEST_TIMEOUT_MS,
        'groq completion'
      ),
      { retries: API_RETRIES, label: 'askGroq' }
    );

    return response.choices?.[0]?.message?.content || '(no response)';
  } catch (error) {
    console.error('askGroq error:', error?.message || error);
    return `Groq error: ${error?.message || 'unknown error'}`;
  }
}

async function safeJsonFromGroq(systemPrompt, userPrompt, fallbackObject) {
  try {
    const response = await retryAsync(
      () => withTimeout(
        () => groq.chat.completions.create({
          model: JSON_MODEL,
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        REQUEST_TIMEOUT_MS,
        'groq json completion'
      ),
      { retries: API_RETRIES, label: 'safeJsonFromGroq' }
    );

    const raw = response.choices?.[0]?.message?.content || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : '{}');
  } catch (error) {
    console.error('safeJsonFromGroq error:', error?.message || error);
    return fallbackObject;
  }
}

async function notionSearch(query) {
  try {
    const response = await retryAsync(
      () => withTimeout(
        () => notion.search({ query, page_size: 10 }),
        REQUEST_TIMEOUT_MS,
        'notion search'
      ),
      { retries: API_RETRIES, label: 'notion search' }
    );
    return response.results || [];
  } catch (error) {
    console.error('Notion search failed:', error.message);
    return [];
  }
}

function formatNotionSearchResults(results) {
  if (!results.length) return 'No Notion results found.';
  return results
    .map((item, index) => {
      const title =
        item.object === 'page'
          ? item.properties?.title?.title?.[0]?.plain_text || item.properties?.Name?.title?.[0]?.plain_text || item.url || 'Untitled page'
          : item.url || 'Untitled';

      return `${index + 1}. ${title}\n${item.url || ''}`;
    })
    .join('\n\n');
}

async function searchTavily(query) {
  try {
    const res = await retryAsync(
      () => withTimeout(
        () => fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query,
            topic: 'general',
            search_depth: 'advanced',
            max_results: 5,
            include_answer: true,
          }),
        }),
        REQUEST_TIMEOUT_MS,
        'tavily search'
      ),
      { retries: API_RETRIES, label: 'tavily search' }
    );

    if (!res.ok) return `Scout error: ${res.status} ${await res.text()}`;

    const data = await res.json();
    const answer = data.answer ? `Summary:\n${data.answer}\n\n` : '';
    const results = Array.isArray(data.results) ? data.results : [];

    if (!results.length) return `${answer}No useful results found.`;

    return answer + results
      .map((r, i) => `${i + 1}. ${r.title || 'Untitled'}\n${r.url || ''}\n${clip(r.content || '', 300)}`)
      .join('\n\n');
  } catch (error) {
    return `Scout error: ${error.message}`;
  }
}

async function updateHistorySummary(channelId) {
  const task = taskMemory.get(channelId);
  if (!task) return;

  const text = await askGroq(
    `あなたは Memory Summariser です。長い履歴から今後の作業に必要な要点を圧縮してください。`,
    `taskType:\n${task.taskType}\ntitle:\n${task.title}\noriginal prompt:\n${task.prompt}\nhistory:\n${buildHistoryContext(channelId, 14)}`,
    { model: TEXT_MODEL, temperature: 0.3, max_tokens: 500 }
  );

  if (!isProviderFailureText(text)) {
    touchTask(task, { historySummary: text });
  }
}

// =========================================================
// bot prompts
// =========================================================

const sparkSystem = `
あなたの名前は Spark です。
役割は発想と方向性整理です。
方向性、複数案、優先順位を考えてください。
Scout の検索結果がある場合のみ事実として使ってください。
同じ一般論を繰り返さず、新しく決めるべき点を優先してください。
短くてもいいので、次に進む材料になる提案を出してください。
`;

const forgeSystem = `
あなたの名前は Forge です。
役割は実務面の検討と必要時の完成物作成です。
相談フェーズでは、実務上の成立性、必要素材、必要工程、足りない情報を指摘してください。
実行フェーズでは、そのまま使える文案、手順、テンプレ、コードなどの完成形を出してください。
Scout の検索結果がある場合のみ事実として使ってください。
`;

const mirrorSystem = `
あなたの名前は Mirror です。
役割は重複排除と論点整理です。
履歴を見て、
1. 重複していること
2. 抜けていること
3. 次に誰が何をすべきか
4. まだ完了ではない理由
を簡潔に出してください。
`;

const coordinatorSystem = `
あなたの名前は Coordinator です。
役割は進行役です。
他の bot の内容を見て、
1. 現時点での結論
2. 決まったこと
3. 未決定のこと
4. 次に進むべき方向
を簡潔にまとめてください。
`;

async function askScoutSearchDecision(taskType, prompt, existingEvidence = '') {
  const parsed = await safeJsonFromGroq(
    `
あなたは Scout Judge です。
役割は「この依頼に外部検索が必要かどうか」と
「今この場で新しく検索し直すべきか」を判断することです。

判断基準:
1. 最新情報、現在の状況、ニュース、締切、制度、人物や団体の公開情報確認が必要なら needSearch = true
2. 既存の検索結果で足りるなら canUseExistingEvidence = true
3. 既存結果が古い、ズレている、無関係、または不足しているなら needFreshSearch = true
4. 発想、構成、文章改善、一般的整理だけで足りるなら needSearch = false
5. query は、検索が必要な場合のみ具体的に書く
6. 推測で埋めない

必ず JSON だけを返してください。
形式:
{
  "needSearch": true,
  "needFreshSearch": false,
  "canUseExistingEvidence": true,
  "reason": "short reason",
  "query": "search query",
  "confidence": "high"
}
`,
    `taskType:\n${taskType}\nprompt:\n${prompt}\nexistingEvidence:\n${existingEvidence || 'none'}\nuserProfile:\n${buildUserProfileContext()}`,
    {
      needSearch: false,
      needFreshSearch: false,
      canUseExistingEvidence: Boolean(existingEvidence),
      reason: 'Fallback decision',
      query: '',
      confidence: 'low',
    }
  );

  return {
    needSearch: Boolean(parsed.needSearch),
    needFreshSearch: Boolean(parsed.needFreshSearch),
    canUseExistingEvidence: Boolean(parsed.canUseExistingEvidence),
    reason: parsed.reason || 'No reason provided.',
    query: parsed.query || '',
    confidence: parsed.confidence || 'low',
  };
}

async function askCoordinatorNextStep(task, latestUserPrompt, turnCount) {
  const parsed = await safeJsonFromGroq(
    `
あなたは Coordinator Decision Engine です。
役割は、会議の現在地点を見て次に誰が話すべきかを決めることです。

選べる nextSpeaker:
- Scout
- Spark
- Forge
- Mirror
- none

ルール:
1. 外部確認が必要そうなら Scout
2. 方向性や発想が必要なら Spark
3. 実務化や完成物が必要なら Forge
4. 重複整理、抜け確認、完了判定前の整理が必要なら Mirror
5. タスクが十分完了しているなら nextSpeaker = "none" かつ taskComplete = true
6. 不要な繰り返しは避ける
7. mode は "discussion" または "execution"
8. 次の担当への具体的指示を書く

必ず JSON だけを返してください。
形式:
{
  "nextSpeaker": "Scout",
  "taskComplete": false,
  "mode": "discussion",
  "reason": "short reason",
  "nextInstruction": "specific instruction"
}
`,
    `taskType:\n${task.taskType}\ntaskHint:\n${taskTypeHint(task.taskType)}\nuserProfile:\n${buildUserProfileContext()}\noriginalPrompt:\n${task.prompt}\nlatestUserPrompt:\n${latestUserPrompt}\nhistorySummary:\n${task.historySummary || 'No summary.'}\nrecentHistory:\n${buildHistoryContext(task.channelId, 10)}\nscoutEvidence:\n${task.scoutEvidence || '検索なし'}\nturnCount:\n${turnCount}`,
    {
      nextSpeaker: 'none',
      taskComplete: true,
      mode: 'discussion',
      reason: 'Fallback completion',
      nextInstruction: '',
    }
  );

  return {
    nextSpeaker: parsed.nextSpeaker || 'none',
    taskComplete: Boolean(parsed.taskComplete),
    mode: parsed.mode === 'execution' ? 'execution' : 'discussion',
    reason: parsed.reason || 'No reason provided.',
    nextInstruction: parsed.nextInstruction || '',
  };
}

async function askCoordinatorFinalSummary(task, latestUserPrompt) {
  return askGroq(
    coordinatorSystem,
    `タスク種別:\n${task.taskType}\n補足:\n${taskTypeHint(task.taskType)}\nユーザープロフィール:\n${buildUserProfileContext()}\n元の依頼:\n${task.prompt}\n最新の追加依頼:\n${latestUserPrompt}\n圧縮された履歴要約:\n${task.historySummary || 'No summary.'}\n最近の履歴:\n${buildHistoryContext(task.channelId, 12)}`,
    { model: TEXT_MODEL, temperature: 0.4, max_tokens: 700 }
  );
}

async function askAgentResponse(role, instruction, task, mode) {
  const basePrompt = `
タスク種別:\n${task.taskType}
補足:\n${taskTypeHint(task.taskType)}
ユーザープロフィール:\n${buildUserProfileContext()}
圧縮された過去要約:\n${task.historySummary || 'No summary.'}
過去ログ:\n${buildHistoryContext(task.channelId, 10)}
Scout の検索結果:\n${task.scoutEvidence || '検索なし'}
Coordinator instruction:\n${instruction}
現在モード:\n${mode}
`;

  if (role === 'Scout') {
    const decision = await askScoutSearchDecision(task.taskType, `${task.prompt}\n\nCoordinator instruction:\n${instruction}`, task.scoutEvidence || '');

    let finalText = `検索判断:\nneedSearch: ${decision.needSearch}\nneedFreshSearch: ${decision.needFreshSearch}\ncanUseExistingEvidence: ${decision.canUseExistingEvidence}\nconfidence: ${decision.confidence}\nreason: ${decision.reason}\nquery: ${decision.query || '(none)'}`;

    if (!decision.needSearch) {
      finalText += '\n\n検索は不要と判断。';
      return finalText;
    }

    if (decision.canUseExistingEvidence && task.scoutEvidence && !decision.needFreshSearch) {
      finalText += '\n\n既存の検索結果を再利用します。';
      return finalText;
    }

    const query = decision.query || instruction || task.prompt;
    const webEvidence = await searchTavily(query);
    const notionEvidence = formatNotionSearchResults(await notionSearch(query));

    const evidence = `Web results:\n${webEvidence}\n\nNotion results:\n${notionEvidence}`;
    touchTask(task, { scoutEvidence: evidence });

    finalText += `\n\n検索結果:\n${evidence}`;
    return finalText;
  }

  if (role === 'Spark') {
    return askGroq(sparkSystem, basePrompt, { model: TEXT_MODEL, temperature: 0.7, max_tokens: 700 });
  }
  if (role === 'Forge') {
    return askGroq(forgeSystem, `${basePrompt}\n前回までの要約:\n${task.summary || 'なし'}`, {
      model: TEXT_MODEL,
      temperature: 0.5,
      max_tokens: 900,
    });
  }
  if (role === 'Mirror') {
    return askGroq(mirrorSystem, basePrompt, { model: TEXT_MODEL, temperature: 0.4, max_tokens: 700 });
  }
  return '(no response)';
}

function roleClient(role) {
  if (role === 'Scout') return scout;
  if (role === 'Spark') return spark;
  if (role === 'Forge') return forge;
  if (role === 'Mirror') return mirror;
  return coordinator;
}

// =========================================================
// discord send helpers
// =========================================================

async function getChannel(botClient, channelId) {
  let channel = botClient.channels.cache.get(channelId);
  if (!channel) channel = await botClient.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  return channel;
}

async function sendAsBot(botClient, channelId, text, label = '') {
  const channel = await retryAsync(
    () => withTimeout(() => getChannel(botClient, channelId), SEND_TIMEOUT_MS, 'fetch discord channel'),
    { retries: SEND_RETRIES, label: 'resolve discord channel' }
  );

  const chunks = splitLongText(text);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = i === 0 || !label ? '' : `[${label} cont. ${i + 1}]\n`;
    await retryAsync(
      () => withTimeout(() => channel.send(prefix + chunks[i]), SEND_TIMEOUT_MS, 'discord send'),
      { retries: SEND_RETRIES, label: 'discord send' }
    );
  }
}

async function safeCoordinatorStop(channelId, text) {
  try {
    await sendAsBot(coordinator, channelId, text, 'Coordinator');
  } catch (error) {
    console.error('Failed to send stop message:', error.message || error);
  }
}

// =========================================================
// meeting orchestration
// =========================================================

async function executeMeetingRun(channel, latestUserPrompt, invocationMode) {
  const task = getTask(channel.id);

  if (!task) {
    await safeCoordinatorStop(channel.id, 'このチャンネルにタスク情報がありません。新しく /starttask してください。');
    return;
  }

  const runId = makeRunId(channel.id);
  touchTask(task, {
    channelId: channel.id,
    cycleCount: 0,
    status: 'running',
    activeSpeaker: 'Coordinator',
    runId,
  });

  scheduleTaskMemorySave({ immediate: true });

  try {
    await updateHistorySummary(channel.id);

    for (let turn = 1; turn <= MAX_DYNAMIC_TURNS; turn++) {
      touchTask(task, { cycleCount: turn, activeSpeaker: 'Coordinator' });

      const next = await askCoordinatorNextStep(task, latestUserPrompt, task.cycleCount);

      addDecision(task, {
        runId,
        turn,
        invocationMode,
        nextSpeaker: next.nextSpeaker,
        mode: next.mode,
        taskComplete: next.taskComplete,
        reason: next.reason,
        nextInstruction: next.nextInstruction,
      });
      deriveListsFromTurn(task, next, latestUserPrompt);

      const coordinatorDecisionText = `会議判断:\nturn: ${task.cycleCount}\nnextSpeaker: ${next.nextSpeaker}\nmode: ${next.mode}\ntaskComplete: ${next.taskComplete}\nreason: ${next.reason}\nnextInstruction: ${next.nextInstruction || '(none)'}`;

      await sendAsBot(coordinator, channel.id, coordinatorDecisionText, 'Coordinator');
      appendHistory(channel.id, 'Coordinator', 'control', coordinatorDecisionText);

      if (next.taskComplete || next.nextSpeaker === 'none') {
        const finalSummary = await askCoordinatorFinalSummary(task, latestUserPrompt);
        await sendAsBot(coordinator, channel.id, finalSummary, 'Coordinator');
        appendHistory(channel.id, 'Coordinator', 'summary', finalSummary);

        touchTask(task, {
          summary: finalSummary,
          status: 'waiting',
          activeSpeaker: 'none',
          runId,
        });
        setOpenQuestions(task, []);
        setNextActions(task, []);

        await updateHistorySummary(channel.id);
        scheduleTaskMemorySave({ immediate: true });
        return;
      }

      const speaker = next.nextSpeaker;
      const mode = next.mode;
      const instruction = next.nextInstruction || latestUserPrompt;

      touchTask(task, { activeSpeaker: speaker });
      const output = await askAgentResponse(speaker, instruction, task, mode);

      await sendAsBot(roleClient(speaker), channel.id, output, speaker);
      appendHistory(channel.id, speaker, mode, output);

      if (isProviderFailureText(output)) {
        touchTask(task, { status: 'error', activeSpeaker: 'none' });
        const stopText = '外部APIの失敗が続いたため安全停止します。しばらく待ってから /continue または /resume を使ってください。';
        await safeCoordinatorStop(channel.id, stopText);
        appendHistory(channel.id, 'Coordinator', 'control', stopText);
        scheduleTaskMemorySave({ immediate: true });
        return;
      }

      if (speaker === 'Forge' && mode === 'execution') {
        touchTask(task, { lastExecution: output });
      }
    }

    touchTask(task, { status: 'waiting', activeSpeaker: 'none' });
    const stopText = '安全上限に達したため、ここで会議を停止します。必要なら /continue または /resume で再開してください。';
    await safeCoordinatorStop(channel.id, stopText);
    appendHistory(channel.id, 'Coordinator', 'control', stopText);
    scheduleTaskMemorySave({ immediate: true });
  } catch (error) {
    console.error('executeMeetingRun failed:', error.message || error);
    touchTask(task, { status: 'error', activeSpeaker: 'none' });
    await safeCoordinatorStop(channel.id, `実行中にエラーが発生したため停止しました: ${error.message}`);
    appendHistory(channel.id, 'Coordinator', 'control', `Run error: ${error.message}`);
    scheduleTaskMemorySave({ immediate: true });
  }
}

async function runResume(channel) {
  const task = getTask(channel.id);
  if (!task) {
    await safeCoordinatorStop(channel.id, 'このチャンネルの保存済みタスクが見つかりません。');
    return;
  }

  const resumeText = `保存済みメモリから再開します。\n\nstatus: ${task.status}\ntaskType: ${task.taskType}\ntitle: ${task.title}\n\nlatest summary:\n${task.summary || 'なし'}\n\nhistory summary:\n${task.historySummary || 'なし'}\n\nopenQuestions:\n${(task.openQuestions || []).join('\n') || 'なし'}\n\nnextActions:\n${(task.nextActions || []).join('\n') || 'なし'}\n\nlast execution:\n${task.lastExecution || 'なし'}`;

  await sendAsBot(coordinator, channel.id, resumeText, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'resume', resumeText);

  touchTask(task, { cycleCount: 0, status: 'idle' });

  const resumePrompt = `保存済みメモリを踏まえて、このタスクを再開してください。\n\n元の依頼:\n${task.prompt}\n\n現在の要約:\n${task.summary || 'なし'}\n\nopenQuestions:\n${(task.openQuestions || []).join('\n') || 'なし'}\n\nnextActions:\n${(task.nextActions || []).join('\n') || 'なし'}\n\n必要なら修正、補強、続行を行ってください。`;

  await enqueueMeetingRun(channel, resumePrompt, 'resume');
}

// =========================================================
// channel create helper
// =========================================================

function buildTaskChannelOverwrites(guild, creatorId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: creatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: SCOUT_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: SPARK_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: FORGE_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: MIRROR_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: COORDINATOR_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  if (TASK_ADMIN_ROLE_ID) {
    overwrites.push({
      id: TASK_ADMIN_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  return overwrites;
}

async function createTaskChannel(guild, creatorId, title, taskType, reason) {
  return guild.channels.create({
    name: safeChannelName(title),
    type: ChannelType.GuildText,
    topic: `Task channel for ${taskType} | title: ${clip(title, 120)}`,
    reason,
    permissionOverwrites: buildTaskChannelOverwrites(guild, creatorId),
  });
}

async function autoCreateTaskFromMessage(message) {
  const guild = message.guild;
  if (!guild) return;

  const prompt = message.content.trim();
  const typeDecision = await classifyTaskType(prompt);
  const taskType = typeDecision.taskType;
  const title = prompt.slice(0, 40).trim() || 'auto-task';

  const channel = await createTaskChannel(
    guild,
    message.author.id,
    title,
    taskType,
    `Auto task from ${message.author.tag}`
  );

  const task = ensureTask(channel.id, taskType, title, prompt);
  touchTask(task, { channelId: channel.id, originalTitle: title, status: 'idle' });

  appendHistory(channel.id, 'User', 'discussion', `Initial request:\n${prompt}`);

  const intro = `通常メッセージから新しいタスクを開始します。\n\n自動判定 taskType:\n${taskType}\n\n判定理由:\n${typeDecision.reason}\n\n元メッセージ:\n${prompt}`;

  await sendAsBot(coordinator, channel.id, intro, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'control', intro);

  await enqueueMeetingRun(channel, prompt, 'auto-start');
}

// =========================================================
// discord handlers
// =========================================================

async function registerCoordinatorCommands() {
  const rest = new REST({ version: '10' }).setToken(COORDINATOR_BOT_TOKEN);

  const commands = [
    new SlashCommandBuilder()
      .setName('starttask')
      .setDescription('Create dedicated task channel and start autonomous team')
      .addStringOption(option => option.setName('task_type').setDescription('Task type').setRequired(true).addChoices(
        { name: 'general', value: 'general' },
        { name: 'research', value: 'research' },
        { name: 'grant', value: 'grant' },
        { name: 'website', value: 'website' },
        { name: 'marketing', value: 'marketing' },
        { name: 'admin', value: 'admin' }
      ))
      .addStringOption(option => option.setName('title').setDescription('Task title').setRequired(true))
      .addStringOption(option => option.setName('prompt').setDescription('What should the team work on?').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('continue')
      .setDescription('Continue autonomous team in current task channel')
      .addStringOption(option => option.setName('prompt').setDescription('What should the team do next?').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder().setName('resume').setDescription('Resume current task from saved memory').toJSON(),
    new SlashCommandBuilder().setName('finish').setDescription('Finish task').toJSON(),
  ];

  await retryAsync(
    () => withTimeout(
      () => rest.put(Routes.applicationGuildCommands(COORDINATOR_CLIENT_ID, DISCORD_GUILD_ID), { body: commands }),
      REQUEST_TIMEOUT_MS,
      'register slash commands'
    ),
    { retries: API_RETRIES, label: 'register coordinator commands' }
  );
  console.log('Coordinator slash commands registered.');
}

scout.once('clientReady', () => console.log(`Scout ready: ${scout.user.tag}`));
spark.once('clientReady', () => console.log(`Spark ready: ${spark.user.tag}`));
forge.once('clientReady', () => console.log(`Forge ready: ${forge.user.tag}`));
mirror.once('clientReady', () => console.log(`Mirror ready: ${mirror.user.tag}`));

coordinator.once('clientReady', async () => {
  console.log(`Coordinator ready: ${coordinator.user.tag}`);
  try {
    await registerCoordinatorCommands();
  } catch (error) {
    console.error('Slash command registration failed:', formatError(error));
  }
});

function attachClientRuntimeHandlers(name, client) {
  client.on('error', error => {
    console.error(`[${name}] client error:`, formatError(error));
  });
  client.on('shardError', error => {
    console.error(`[${name}] shard error:`, formatError(error));
  });
  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[${name}] shard disconnected (id=${shardId}, code=${event?.code ?? 'n/a'})`);
  });
  client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[${name}] shard resumed (id=${shardId}, replayed=${replayedEvents})`);
  });
}

attachClientRuntimeHandlers('Scout', scout);
attachClientRuntimeHandlers('Spark', spark);
attachClientRuntimeHandlers('Forge', forge);
attachClientRuntimeHandlers('Mirror', mirror);
attachClientRuntimeHandlers('Coordinator', coordinator);

coordinator.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'starttask') {
    const taskType = interaction.options.getString('task_type', true);
    const title = interaction.options.getString('title', true);
    const prompt = interaction.options.getString('prompt', true);

    await interaction.reply({ content: '依頼を受け取りました。専用チャンネルを作成します。', flags: 64 });

    queueMicrotask(async () => {
      try {
        const guild = interaction.guild;
        if (!guild) return;

        const channel = await createTaskChannel(
          guild,
          interaction.user.id,
          title,
          taskType,
          `Task requested by ${interaction.user.tag}`
        );

        const task = ensureTask(channel.id, taskType, title, prompt);
        touchTask(task, { channelId: channel.id, originalTitle: title, status: 'idle' });

        appendHistory(channel.id, 'User', 'discussion', `Initial request:\n${prompt}`);

        const startText = `新しいタスクを開始します。\n\nType: ${taskType}\nTitle: ${title}\n\nここからチームが自律的に会議して、必要なら実行まで進めます。`;

        await channel.send(startText);
        appendHistory(channel.id, 'Coordinator', 'control', startText);

        await enqueueMeetingRun(channel, prompt, 'start');
      } catch (error) {
        console.error('starttask background error:', error);
      }
    });
    return;
  }

  if (interaction.commandName === 'continue') {
    const prompt = interaction.options.getString('prompt', true);
    await interaction.reply({ content: '追加の自律会議を開始します。', flags: 64 });

    queueMicrotask(async () => {
      try {
        if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

        const task = getTask(interaction.channel.id);
        if (!task) {
          await interaction.channel.send('このチャンネルにタスク情報がありません。');
          return;
        }

        touchTask(task, { cycleCount: 0, status: 'idle' });
        appendHistory(interaction.channel.id, 'User', 'execution', `User follow-up:\n${prompt}`);

        await enqueueMeetingRun(interaction.channel, prompt, 'continue');
      } catch (error) {
        console.error('continue background error:', error);
      }
    });
    return;
  }

  if (interaction.commandName === 'resume') {
    await interaction.reply({ content: '保存済みメモリから再開します。', flags: 64 });

    queueMicrotask(async () => {
      try {
        if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

        const task = getTask(interaction.channel.id);
        if (!task) {
          await interaction.channel.send('このチャンネルに保存済みタスク情報がありません。');
          return;
        }

        await runResume(interaction.channel);
      } catch (error) {
        console.error('resume background error:', error);
      }
    });
    return;
  }

  if (interaction.commandName === 'finish') {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: '通常のタスクチャンネル内で使って。', flags: 64 });
      return;
    }

    const task = getTask(interaction.channel.id);
    if (task) {
      touchTask(task, { status: 'completed', activeSpeaker: 'none' });
      addDecision(task, { event: 'finish', note: 'Task finished by user command.' });
    }

    taskMemory.delete(interaction.channel.id);
    scheduleTaskMemorySave({ immediate: true });

    await interaction.reply({ content: 'タスク終了。', flags: 64 });
  }
});

coordinator.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content?.startsWith('/')) return;

    const decision = await shouldAutoRespond(message);
    if (!decision.shouldRespond) return;

    const channelName = message.channel?.name || '';

    if (channelName.startsWith('task-')) {
      const task = getTask(message.channel.id);
      if (!task) {
        await sendAsBot(coordinator, message.channel.id, 'このチャンネルに保存済みタスクがありません。', 'Coordinator');
        return;
      }

      const content = message.content.trim();
      const prompt = content.replace(/^!(run|continue)(?:\s+|$)/i, '').trim();
      if (!prompt) {
        await sendAsBot(coordinator, message.channel.id, '指示文が空です。`!continue <指示>` 形式で送ってください。', 'Coordinator');
        return;
      }

      touchTask(task, { cycleCount: 0, status: 'idle' });
      appendHistory(message.channel.id, 'User', 'execution', `User command message:\n${prompt}`);

      await sendAsBot(coordinator, message.channel.id, 'コマンド形式の通常メッセージを受理しました。会議を再開します。', 'Coordinator');
      await enqueueMeetingRun(message.channel, prompt, 'normal-message');
      return;
    }

    if (decision.isNewTask) {
      await message.reply('依頼として受け取りました。専用チャンネルを作って進めます。');
      await autoCreateTaskFromMessage(message);
    }
  } catch (error) {
    console.error('messageCreate error:', error);
  }
});

// =========================================================
// bootstrap
// =========================================================

const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server listening on ${PORT}`);
});

async function loginBot(client, token, name) {
  await retryAsync(
    () => withTimeout(() => client.login(token), REQUEST_TIMEOUT_MS, `${name} login`),
    { retries: API_RETRIES, label: `${name} login` }
  );
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] ${signal} received. Flushing state...`);

  if (saveState.supabaseTimer) {
    clearTimeout(saveState.supabaseTimer);
    saveState.supabaseTimer = null;
  }

  await flushTaskMemory({ local: true, supabase: true });
  await saveUserProfile();

  const clients = [scout, spark, forge, mirror, coordinator];
  await Promise.allSettled(clients.map(client => client.destroy()));

  await new Promise(resolve => {
    healthServer.close(() => {
      console.log('[shutdown] health server closed.');
      resolve();
    });
  });
  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

(async () => {
  try {
    console.log('[startup] Loading persisted state from Supabase (fallback JSON only if needed)...');
    await loadTaskMemory();
    await loadUserProfile();

    console.log('[startup] Logging in Discord clients...');
    await Promise.all([
      loginBot(scout, SCOUT_BOT_TOKEN, 'Scout'),
      loginBot(spark, SPARK_BOT_TOKEN, 'Spark'),
      loginBot(forge, FORGE_BOT_TOKEN, 'Forge'),
      loginBot(mirror, MIRROR_BOT_TOKEN, 'Mirror'),
      loginBot(coordinator, COORDINATOR_BOT_TOKEN, 'Coordinator'),
    ]);
    console.log('[startup] All Discord clients login initiated.');
  } catch (error) {
    console.error('[startup] fatal error:', formatError(error));
    process.exit(1);
  }
})();
