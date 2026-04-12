import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import http from 'http';
import { Client as NotionClient } from '@notionhq/client';

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

  GEMINI_API_KEY,
  GROQ_API_KEY,
  OPENROUTER_API_KEY,
  TAVILY_API_KEY,
  NOTION_KEY,
  NOTION_PAGE_ID,

  SUPABASE_URL,
  SUPABASE_ANON_KEY,
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

  !GEMINI_API_KEY ||
  !GROQ_API_KEY ||
  !OPENROUTER_API_KEY ||
  !TAVILY_API_KEY ||
  !NOTION_KEY ||

  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY
) {
  console.error('Missing required env vars.');
  process.exit(1);
}

const gemini = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PORT = process.env.PORT || 10000;

const notion = new NotionClient({
  auth: NOTION_KEY,
});

const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('ok');
});

healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server listening on ${PORT}`);
});

const scout = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const spark = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const forge = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const mirror = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const coordinator = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DISCORD_SAFE_LIMIT = 1800;
const MAX_DYNAMIC_TURNS = 18;
const MEMORY_FILE = path.join(process.cwd(), 'task_memory.json');
const PROFILE_FILE = path.join(process.cwd(), 'user_profile.json');
let userProfile = {};

const taskMemory = new Map();

/**
 * taskMemory shape
 * {
 *   taskType: string,
 *   title: string,
 *   prompt: string,
 *   scoutEvidence: string,
 *   discussionDone: boolean,
 *   summary: string,
 *   historySummary: string,
 *   lastExecution: string,
 *   cycleCount: number,
 *   channelId?: string,
 *   history: Array<{
 *     role: string,
 *     mode: string,
 *     content: string,
 *     timestamp: string
 *   }>
 * }
 */

async function saveTaskMemory() {
  try {
    const data = Object.fromEntries(taskMemory);

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');

    const { error } = await supabase
      .from('bot_storage')
      .upsert({
        key: 'task_memory',
        value: data,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to save task memory to Supabase:', error.message);
    }
  } catch (error) {
    console.error('Failed to save task memory:', error);
  }
}

async function loadTaskMemory() {
  try {
    const { data, error } = await supabase
      .from('bot_storage')
      .select('value')
      .eq('key', 'task_memory')
      .maybeSingle();

    if (!error && data?.value) {
      taskMemory.clear();

      for (const [key, value] of Object.entries(data.value)) {
        taskMemory.set(key, value);
      }

      console.log(`Loaded ${taskMemory.size} task memories from Supabase.`);
      return;
    }

    if (!fs.existsSync(MEMORY_FILE)) return;

    const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    taskMemory.clear();

    for (const [key, value] of Object.entries(parsed)) {
      taskMemory.set(key, value);
    }

    console.log(`Loaded ${taskMemory.size} task memories locally.`);
  } catch (error) {
    console.error('Failed to load task memory:', error);
  }
}

async function loadUserProfile() {
  try {
    const { data, error } = await supabase
      .from('bot_storage')
      .select('value')
      .eq('key', 'user_profile')
      .maybeSingle();

    if (!error && data?.value) {
      userProfile = data.value;
      console.log('Loaded user profile from Supabase.');
      return;
    }

    if (!fs.existsSync(PROFILE_FILE)) {
      userProfile = {};
      return;
    }

    const raw = fs.readFileSync(PROFILE_FILE, 'utf8');
    if (!raw.trim()) {
      userProfile = {};
      return;
    }

    userProfile = JSON.parse(raw);
    console.log('Loaded user profile locally.');
  } catch (error) {
    console.error('Failed to load user profile:', error);
    userProfile = {};
  }
}

async function saveUserProfile() {
  try {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(userProfile, null, 2), 'utf8');

    const { error } = await supabase
      .from('bot_storage')
      .upsert({
        key: 'user_profile',
        value: userProfile,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to save user profile to Supabase:', error.message);
    }
  } catch (error) {
    console.error('Failed to save user profile:', error);
  }
}

async function notionSearch(query) {
  try {
    const response = await notion.search({
      query,
      page_size: 10,
    });

    return response.results || [];
  } catch (error) {
    console.error('Notion search failed:', error.message);
    return [];
  }
}

async function notionRetrievePage(pageId) {
  try {
    return await notion.pages.retrieve({ page_id: pageId });
  } catch (error) {
    console.error('Notion page retrieve failed:', error.message);
    return null;
  }
}

function formatNotionSearchResults(results) {
  if (!results.length) {
    return 'No Notion results found.';
  }

  return results
    .map((item, index) => {
      const title =
        item.object === 'page'
          ? (item.properties?.title?.title?.[0]?.plain_text ||
             item.properties?.Name?.title?.[0]?.plain_text ||
             item.url ||
             'Untitled page')
          : item.url || 'Untitled';

      return `${index + 1}. ${title}\n${item.url || ''}`;
    })
    .join('\n\n');
}

function safeChannelName(title) {
  return `task-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

function clip(text, max = 500) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + ' ...' : text;
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

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

async function getChannel(botClient, channelId) {
  let channel = botClient.channels.cache.get(channelId);
  if (!channel) {
    channel = await botClient.channels.fetch(channelId);
  }
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }
  return channel;
}

async function sendAsBot(botClient, channelId, text, label = '') {
  const channel = await getChannel(botClient, channelId);
  const chunks = splitLongText(text);

  for (let i = 0; i < chunks.length; i++) {
    const prefix =
      i === 0 || !label
        ? ''
        : `[${label} cont. ${i + 1}]\n`;

    await channel.send(prefix + chunks[i]);
  }
}

function ensureTask(channelId, taskType, title, prompt) {
  if (!taskMemory.has(channelId)) {
    taskMemory.set(channelId, {
      taskType,
      title,
      prompt,
      scoutEvidence: '',
      discussionDone: false,
      summary: '',
      historySummary: '',
      lastExecution: '',
      cycleCount: 0,
      history: [],
    });
    saveTaskMemory();
  }
  return taskMemory.get(channelId);
}

function getTask(channelId) {
  return taskMemory.get(channelId);
}

function appendHistory(channelId, role, mode, content) {
  const task = taskMemory.get(channelId);
  if (!task) return;

  if (!Array.isArray(task.history)) {
    task.history = [];
  }

  task.history.push({
    role,
    mode,
    content,
    timestamp: new Date().toISOString(),
  });

  if (task.history.length > 120) {
    task.history = task.history.slice(-120);
  }

  saveTaskMemory();
}

function buildHistoryContext(channelId, maxItems = 14) {
  const task = taskMemory.get(channelId);
  if (!task || !Array.isArray(task.history) || task.history.length === 0) {
    return 'No prior history.';
  }

  return task.history
    .slice(-maxItems)
    .map((item, index) => {
      return [
        `History ${index + 1}`,
        `Role: ${item.role}`,
        `Mode: ${item.mode}`,
        `Content: ${clip(item.content, 700)}`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildUserProfileContext() {
  if (!userProfile || Object.keys(userProfile).length === 0) {
    return 'No user profile available.';
  }

  return JSON.stringify(userProfile, null, 2);
}

function taskTypeHint(taskType) {
  const hints = {
    general:
      '一般的な相談、整理、方向性設計、実務補助として扱ってください。',
    research:
      '研究テーマ、文献、理論枠組み、方法論、研究計画、論理構成を重視してください。',
    grant:
      '助成金、公募、申請文、審査視点、締切、要件、実現可能性を重視してください。',
    website:
      'Webサイト、情報設計、掲載内容、導線、ブランド表現、構成を重視してください。',
    marketing:
      '発信戦略、ターゲット、訴求角度、投稿案、導線を重視してください。',
    admin:
      '事務処理、テンプレート、手順、抜け漏れ防止、実務整理を重視してください。',
  };

  return hints[taskType] || hints.general;
}

async function searchTavily(query) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
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
    });

    if (!res.ok) {
      const text = await res.text();
      return `Scout error: ${res.status} ${text}`;
    }

    const data = await res.json();
    const answer = data.answer ? `Summary:\n${data.answer}\n\n` : '';
    const results = Array.isArray(data.results) ? data.results : [];

    if (!results.length) {
      return `${answer}No useful results found.`;
    }

    return (
      answer +
      results
        .map((r, i) => {
          return `${i + 1}. ${r.title || 'Untitled'}\n${r.url || ''}\n${clip(r.content || '', 300)}`;
        })
        .join('\n\n')
    );
  } catch (error) {
    return `Scout error: ${error.message}`;
  }
}

function isModelLimitError(error) {
  const msg = String(error?.message || '').toLowerCase();

  return (
    msg.includes('429') ||
    msg.includes('413') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('credit') ||
    msg.includes('insufficient') ||
    msg.includes('too large') ||
    msg.includes('timeout')
  );
}

async function askOpenRouter(systemPrompt, userPrompt) {
  try {
    const response = await openrouter.chat.completions.create({
      model: 'openai/gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices?.[0]?.message?.content || '(no response)';
  } catch (error) {
    console.error('askOpenRouter error:', error?.message || error);
    return `OpenRouter error: ${error?.message || 'unknown error'}`;
  }
}

async function safeJsonFromGroq(systemPrompt, userPrompt, fallbackObject) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : '{}');
  } catch (error) {
    if (isModelLimitError(error)) {
      try {
        const raw = await askOpenRouter(
          systemPrompt,
          `${userPrompt}\nReturn JSON only.`
        );
        const match = raw.match(/\{[\s\S]*\}/);
        return JSON.parse(match ? match[0] : '{}');
      } catch {
        return fallbackObject;
      }
    }
    return fallbackObject;
  }
}

async function updateHistorySummary(channelId) {
  const task = taskMemory.get(channelId);
  if (!task) return;

  const historyContext = buildHistoryContext(channelId, 20);

  const systemPrompt = `
あなたは Memory Summariser です。
役割は、長い履歴から今後の作業に必要な要点だけを圧縮して残すことです。

必ず短く整理してください。
1. 依頼の核心
2. すでに決まったこと
3. 未決定のこと
4. 現在の方向
5. 次に重要なこと

冗長な説明や雑談は入れないでください。
200〜400語程度で十分です。
`;

  const userPrompt = `
taskType:
${task.taskType}

title:
${task.title}

original prompt:
${task.prompt}

history:
${historyContext}
`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const text = response.choices?.[0]?.message?.content || '';
    task.historySummary = text;
    saveTaskMemory();
  } catch (error) {
    if (isModelLimitError(error)) {
      try {
        const text = await askOpenRouter(systemPrompt, userPrompt);
        task.historySummary = text;
        saveTaskMemory();
      } catch {
        // ignore
      }
    }
  }
}

const sparkSystem = `
あなたの名前は Spark です。
役割は発想と方向性整理です。
方向性、複数案、世界観、優先順位を考えてください。
Scout の検索結果がある場合のみ事実として使ってください。
同じ一般論を繰り返さず、新しく決めるべき点を優先してください。
`;

const forgeSystem = `
あなたの名前は Forge です。
役割は実務面の検討と問題点指摘、必要時の完成物作成です。
相談フェーズでは、実務上の成立性、必要素材、必要工程、足りない情報、危険な前提を指摘してください。
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
4. まだ完了ではない理由があるなら何か
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
  const systemPrompt = `
あなたは Scout Judge です。
役割は「この依頼に外部検索が必要かどうか」と
「今この場で新しく検索し直すべきか」を判断することです。

判断基準:
1. 最新情報、現在の状況、ニュース、締切、制度、人物や団体の公開情報確認が必要なら needSearch = true
2. 既存の検索結果で足りるなら canUseExistingEvidence = true
3. 既存結果が古い、ズレている、無関係、または不足しているなら needFreshSearch = true
4. 発想、構成、文章改善、一般的整理だけで足りるなら needSearch = false
5. 事実確認なしで進めるとハルシネーションの危険が高いなら needSearch = true
6. query は、検索が必要な場合のみ具体的に書く
7. 推測で埋めない

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
`;

  const userPrompt = `
taskType:
${taskType}

prompt:
${prompt}

existingEvidence:
${existingEvidence || 'none'}

userProfile:
${buildUserProfileContext()}
`;

  const fallbackObject = {
    needSearch: true,
    needFreshSearch: !existingEvidence,
    canUseExistingEvidence: Boolean(existingEvidence),
    reason: 'Fallback decision',
    query: prompt,
    confidence: 'low',
  };

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, fallbackObject);

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
  const historyContext = buildHistoryContext(task.channelId, 16);
  const historySummary = task.historySummary || 'No summary.';
  const scoutEvidence = task.scoutEvidence || '検索なし';

  const systemPrompt = `
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
7. 毎回全員を回す必要はない
8. 具体的な nextInstruction を書く
9. mode は "discussion" または "execution"

必ず JSON だけを返してください。
形式:
{
  "nextSpeaker": "Scout",
  "taskComplete": false,
  "mode": "discussion",
  "reason": "short reason",
  "nextInstruction": "specific instruction"
}
`;

  const userPrompt = `
taskType:
${task.taskType}

taskHint:
${taskTypeHint(task.taskType)}

userProfile:
${buildUserProfileContext()}

originalPrompt:
${task.prompt}

latestUserPrompt:
${latestUserPrompt}

historySummary:
${historySummary}

recentHistory:
${historyContext}

scoutEvidence:
${scoutEvidence}

turnCount:
${turnCount}
`;

  const fallbackObject = {
    nextSpeaker: 'Mirror',
    taskComplete: true,
    mode: 'discussion',
    reason: 'Fallback completion',
    nextInstruction: '',
  };

  const parsed = await safeJsonFromGroq(systemPrompt, userPrompt, fallbackObject);

  return {
    nextSpeaker: parsed.nextSpeaker || 'none',
    taskComplete: Boolean(parsed.taskComplete),
    mode: parsed.mode === 'execution' ? 'execution' : 'discussion',
    reason: parsed.reason || 'No reason provided.',
    nextInstruction: parsed.nextInstruction || '',
  };
}

async function askCoordinatorFinalSummary(task, latestUserPrompt) {
  const historyContext = buildHistoryContext(task.channelId, 18);
  const historySummary = task.historySummary || 'No summary.';

  const userPrompt = `
タスク種別:
${task.taskType}

補足:
${taskTypeHint(task.taskType)}

ユーザープロフィール:
${buildUserProfileContext()}

元の依頼:
${task.prompt}

最新の追加依頼:
${latestUserPrompt}

圧縮された履歴要約:
${historySummary}

最近の履歴:
${historyContext}
`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: coordinatorSystem },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices?.[0]?.message?.content || '(no response)';
  } catch (error) {
    if (isModelLimitError(error)) {
      return await askOpenRouter(coordinatorSystem, userPrompt);
    }
    return `Coordinator error: ${error.message}`;
  }
}

async function askAgentResponse(role, instruction, task, mode) {
  const historyContext = buildHistoryContext(task.channelId, 14);
  const historySummary = task.historySummary || 'No summary.';
  const scoutEvidence = task.scoutEvidence || '検索なし';

  if (role === 'Scout') {
    const decision = await askScoutSearchDecision(
      task.taskType,
      `${task.prompt}\n\nCoordinator instruction:\n${instruction}`,
      scoutEvidence
    );

    const decisionText = `検索判断:
needSearch: ${decision.needSearch}
needFreshSearch: ${decision.needFreshSearch}
canUseExistingEvidence: ${decision.canUseExistingEvidence}
confidence: ${decision.confidence}
reason: ${decision.reason}
query: ${decision.query || '(none)'}`;

    let finalText = decisionText;

    if (!decision.needSearch) {
      finalText += `\n\n検索は不要と判断。`;
    } else if (
      decision.canUseExistingEvidence &&
      task.scoutEvidence &&
      !decision.needFreshSearch
    ) {
      finalText += `\n\n既存の検索結果を再利用します。`;
    } else {
      const query = decision.query || instruction || task.prompt;
      const webEvidence = await searchTavily(query);
      const notionResults = await notionSearch(query);
      const notionEvidence = formatNotionSearchResults(notionResults);

const evidence = `Web results:\n${webEvidence}\n\nNotion results:\n${notionEvidence}`;
task.scoutEvidence = evidence;
      saveTaskMemory();

      finalText += `\n\n検索結果:\n${evidence}`;
    }

    return finalText;
  }

  if (role === 'Spark') {
    const userPrompt = `
タスク種別:
${task.taskType}

補足:
${taskTypeHint(task.taskType)}

ユーザープロフィール:
${buildUserProfileContext()}

圧縮された過去要約:
${historySummary}

過去ログ:
${historyContext}

Scout の検索結果:
${scoutEvidence}

Coordinator instruction:
${instruction}

現在モード:
${mode}
`;

    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${sparkSystem}\n\n${userPrompt}`,
      });

      return response.text || '(no response)';
    } catch (error) {
      if (isModelLimitError(error)) {
        return await askOpenRouter(sparkSystem, userPrompt);
      }
      return `Spark error: ${error.message}`;
    }
  }

  if (role === 'Forge') {
    const userPrompt = `
タスク種別:
${task.taskType}

補足:
${taskTypeHint(task.taskType)}

ユーザープロフィール:
${buildUserProfileContext()}

圧縮された過去要約:
${historySummary}

過去ログ:
${historyContext}

Scout の検索結果:
${scoutEvidence}

前回までの要約:
${task.summary || 'なし'}

Coordinator instruction:
${instruction}

現在モード:
${mode}
`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: forgeSystem },
          { role: 'user', content: userPrompt },
        ],
      });

      return response.choices?.[0]?.message?.content || '(no response)';
    } catch (error) {
      if (isModelLimitError(error)) {
        return await askOpenRouter(forgeSystem, userPrompt);
      }
      return `Forge error: ${error.message}`;
    }
  }

  if (role === 'Mirror') {
    const userPrompt = `
タスク種別:
${task.taskType}

補足:
${taskTypeHint(task.taskType)}

ユーザープロフィール:
${buildUserProfileContext()}

圧縮された過去要約:
${historySummary}

過去ログ:
${historyContext}

Scout の検索結果:
${scoutEvidence}

Coordinator instruction:
${instruction}

現在モード:
${mode}
`;

    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${mirrorSystem}\n\n${userPrompt}`,
      });

      return response.text || '(no response)';
    } catch (error) {
      if (isModelLimitError(error)) {
        return await askOpenRouter(mirrorSystem, userPrompt);
      }
      return `Mirror error: ${error.message}`;
    }
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

async function runDynamicMeeting(channel, latestUserPrompt, invocationMode) {
  const task = getTask(channel.id);

  if (!task) {
    await sendAsBot(
      coordinator,
      channel.id,
      'このチャンネルにタスク情報がありません。新しく /starttask して。',
      'Coordinator'
    );
    return;
  }

  task.channelId = channel.id;
  task.cycleCount = 0;
  saveTaskMemory();

  await updateHistorySummary(channel.id);

  while (task.cycleCount < MAX_DYNAMIC_TURNS) {
    task.cycleCount += 1;
    saveTaskMemory();

    const next = await askCoordinatorNextStep(
      task,
      latestUserPrompt,
      task.cycleCount
    );

    const coordinatorDecisionText = `会議判断:
turn: ${task.cycleCount}
nextSpeaker: ${next.nextSpeaker}
mode: ${next.mode}
taskComplete: ${next.taskComplete}
reason: ${next.reason}
nextInstruction: ${next.nextInstruction || '(none)'}`;

    await sendAsBot(coordinator, channel.id, coordinatorDecisionText, 'Coordinator');
    appendHistory(channel.id, 'Coordinator', 'control', coordinatorDecisionText);

    if (next.taskComplete || next.nextSpeaker === 'none') {
      const finalSummary = await askCoordinatorFinalSummary(task, latestUserPrompt);
      await sendAsBot(coordinator, channel.id, finalSummary, 'Coordinator');
      appendHistory(channel.id, 'Coordinator', 'summary', finalSummary);

      task.summary = finalSummary;
      saveTaskMemory();
      await updateHistorySummary(channel.id);
      return;
    }

    const speaker = next.nextSpeaker;
    const mode = next.mode;
    const instruction = next.nextInstruction || latestUserPrompt;

    const output = await askAgentResponse(speaker, instruction, task, mode);
    await sendAsBot(roleClient(speaker), channel.id, output, speaker);
    appendHistory(channel.id, speaker, mode, output);

    if (speaker === 'Forge' && mode === 'execution') {
      task.lastExecution = output;
      saveTaskMemory();
    }

    await updateHistorySummary(channel.id);
  }

  const stopText = '安全上限に達したため、ここで会議を停止します。必要なら /continue または /resume で再開してください。';
  await sendAsBot(coordinator, channel.id, stopText, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'control', stopText);
}

async function runResume(channel) {
  const task = getTask(channel.id);

  if (!task) {
    await sendAsBot(
      coordinator,
      channel.id,
      'このチャンネルの保存済みタスクが見つかりません。',
      'Coordinator'
    );
    return;
  }

  const resumeText = `保存済みメモリから再開します。

taskType: ${task.taskType}
title: ${task.title}

original prompt:
${task.prompt}

latest summary:
${task.summary || 'なし'}

history summary:
${task.historySummary || 'なし'}

last execution:
${task.lastExecution || 'なし'}`;

  await sendAsBot(coordinator, channel.id, resumeText, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'resume', resumeText);

  task.cycleCount = 0;
  saveTaskMemory();

  const resumePrompt = `
保存済みメモリを踏まえて、このタスクを再開してください。

元の依頼:
${task.prompt}

現在の要約:
${task.summary || 'なし'}

直近の実行内容:
${task.lastExecution || 'なし'}

必要なら修正、補強、続行を行ってください。
`;

  await runDynamicMeeting(channel, resumePrompt, 'resume');
}

async function shouldAutoRespond(message) {
  if (!message.content?.trim()) {
    return {
      shouldRespond: false,
      reason: 'empty',
      isNewTask: false,
    };
  }

  const content = message.content.trim();

  if (content.length < 2) {
    return {
      shouldRespond: false,
      reason: 'too short',
      isNewTask: false,
    };
  }

  const channelName = message.channel?.name || '';

  if (channelName.startsWith('task-')) {
    return {
      shouldRespond: true,
      reason: 'task channel',
      isNewTask: false,
    };
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

  const fallbackObject = {
    shouldRespond: false,
    reason: 'fallback ignore',
    isNewTask: false,
  };

  const parsed = await safeJsonFromGroq(
    systemPrompt,
    userPrompt,
    fallbackObject
  );

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

分類基準:
- research: 論文、研究、文献、分析、学術、方法論、アイデア整理
- grant: 助成金、公募、申請、審査、予算、締切
- website: Webサイト、構成、掲載内容、デザイン、導線
- marketing: SNS、広報、告知、投稿、宣伝、ターゲット
- admin: 手続き、事務、メール、契約、書類、スケジュール整理
- general: 上記に明確に当てはまらない一般相談

必ず JSON だけ返してください。

形式:
{
  "taskType": "general",
  "reason": "short reason"
}
`;

  const userPrompt = `
message:
${messageContent}

userProfile:
${buildUserProfileContext()}
`;

  const fallbackObject = {
    taskType: 'general',
    reason: 'fallback general',
  };

  const parsed = await safeJsonFromGroq(
    systemPrompt,
    userPrompt,
    fallbackObject
  );

  const allowed = [
    'research',
    'grant',
    'website',
    'marketing',
    'admin',
    'general',
  ];

  return {
    taskType: allowed.includes(parsed.taskType)
      ? parsed.taskType
      : 'general',
    reason: parsed.reason || 'No reason',
  };
}

async function autoCreateTaskFromMessage(message) {
  const guild = message.guild;
  if (!guild) return;

  const prompt = message.content.trim();

  const typeDecision = await classifyTaskType(prompt);
  const taskType = typeDecision.taskType;

  const title =
    prompt
      .slice(0, 30)
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'auto-task';

  const channel = await guild.channels.create({
    name: safeChannelName(title),
    type: ChannelType.GuildText,
    topic: `Auto task from normal message`,
    reason: `Auto task from ${message.author.tag}`,
  });

  const task = ensureTask(channel.id, taskType, title, prompt);
  task.channelId = channel.id;
  saveTaskMemory();

  appendHistory(
    channel.id,
    'User',
    'discussion',
    `Initial request:\n${prompt}`
  );

  const intro = `通常メッセージから新しいタスクを開始します。

自動判定 taskType:
${taskType}

判定理由:
${typeDecision.reason}

元メッセージ:
${prompt}

ここから自律会議を開始します。`;

  await sendAsBot(coordinator, channel.id, intro, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'control', intro);

  await runDynamicMeeting(channel, prompt, 'auto-start');
}

async function registerCoordinatorCommands() {
  const rest = new REST({ version: '10' }).setToken(COORDINATOR_BOT_TOKEN);

  const commands = [
    new SlashCommandBuilder()
      .setName('starttask')
      .setDescription('Create dedicated task channel and start autonomous team')
      .addStringOption(option =>
        option
          .setName('task_type')
          .setDescription('Task type')
          .setRequired(true)
          .addChoices(
            { name: 'general', value: 'general' },
            { name: 'research', value: 'research' },
            { name: 'grant', value: 'grant' },
            { name: 'website', value: 'website' },
            { name: 'marketing', value: 'marketing' },
            { name: 'admin', value: 'admin' }
          )
      )
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Task title')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('prompt')
          .setDescription('What should the team work on?')
          .setRequired(true)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('continue')
      .setDescription('Continue autonomous team in current task channel')
      .addStringOption(option =>
        option
          .setName('prompt')
          .setDescription('What should the team do next?')
          .setRequired(true)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('resume')
      .setDescription('Resume current task from saved memory')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('finish')
      .setDescription('Finish task')
      .toJSON(),
  ];

  await rest.put(
    Routes.applicationGuildCommands(COORDINATOR_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );

  console.log('Coordinator slash commands registered.');
}

scout.once('clientReady', () => {
  console.log(`Scout ready: ${scout.user.tag}`);
});

spark.once('clientReady', () => {
  console.log(`Spark ready: ${spark.user.tag}`);
});

forge.once('clientReady', () => {
  console.log(`Forge ready: ${forge.user.tag}`);
});

mirror.once('clientReady', () => {
  console.log(`Mirror ready: ${mirror.user.tag}`);
});

coordinator.once('clientReady', async () => {
  console.log(`Coordinator ready: ${coordinator.user.tag}`);

  try {
    await registerCoordinatorCommands();
  } catch (error) {
    console.error('Slash command registration failed:', error);
  }
});

coordinator.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === 'starttask') {
  const taskType = interaction.options.getString('task_type', true);
  const title = interaction.options.getString('title', true);
  const prompt = interaction.options.getString('prompt', true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('Guild not found.');
      return;
    }

    const channel = await guild.channels.create({
      name: safeChannelName(title),
      type: ChannelType.GuildText,
      topic: `Task channel for ${taskType}: ${title}`,
      reason: `Task requested by ${interaction.user.tag}`,
    });

    const task = ensureTask(channel.id, taskType, title, prompt);
    task.channelId = channel.id;
    saveTaskMemory();

    appendHistory(
      channel.id,
      'User',
      'discussion',
      `Initial request:\n${prompt}`
    );

    await interaction.editReply(`専用チャンネルを作成しました: ${channel}`);

    const startText = `新しいタスクを開始します。
Type: ${taskType}
Title: ${title}

ここからチームが自律的に会議して、必要なら実行まで進めます。`;

    setTimeout(async () => {
      try {
        await sendAsBot(coordinator, channel.id, startText, 'Coordinator');
        appendHistory(channel.id, 'Coordinator', 'control', startText);

        await runDynamicMeeting(channel, prompt, 'start');
      } catch (error) {
        console.error(error);

        try {
          await sendAsBot(
            coordinator,
            channel.id,
            `処理中にエラーが発生しました: ${error.message}`,
            'Coordinator'
          );
        } catch (innerError) {
          console.error('Failed to send error message to task channel:', innerError);
        }
      }
    }, 0);
  } catch (error) {
    console.error(error);

    try {
      await interaction.editReply(`エラー: ${error.message}`);
    } catch (replyError) {
      console.error('Failed to edit reply:', replyError);
    }
  }

  return;
}

    const channel = await guild.channels.create({
      name: safeChannelName(title),
      type: ChannelType.GuildText,
      topic: `Task channel for ${taskType}: ${title}`,
      reason: `Task requested by ${interaction.user.tag}`,
    });

    const task = ensureTask(channel.id, taskType, title, prompt);
    task.channelId = channel.id;
    saveTaskMemory();

    appendHistory(
      channel.id,
      'User',
      'discussion',
      `Initial request:\n${prompt}`
    );

    await interaction.editReply(`専用チャンネルを作成しました: ${channel}`);

    const startText = `新しいタスクを開始します。
Type: ${taskType}
Title: ${title}

ここからチームが自律的に会議して、必要なら実行まで進めます。`;

    setTimeout(async () => {
      try {
        await sendAsBot(coordinator, channel.id, startText, 'Coordinator');
        appendHistory(channel.id, 'Coordinator', 'control', startText);

        await runDynamicMeeting(channel, prompt, 'start');
      } catch (error) {
        console.error(error);

        try {
          await sendAsBot(
            coordinator,
            channel.id,
            `処理中にエラーが発生しました: ${error.message}`,
            'Coordinator'
          );
        } catch (innerError) {
          console.error('Failed to send error message to task channel:', innerError);
        }
      }
    }, 0);
  } catch (error) {
    console.error(error);

    try {
      await interaction.editReply(`エラー: ${error.message}`);
    } catch (replyError) {
      console.error('Failed to edit reply:', replyError);
    }
  }

  return;
}

      const channel = await guild.channels.create({
        name: safeChannelName(title),
        type: ChannelType.GuildText,
        topic: `Task channel for ${taskType}: ${title}`,
        reason: `Task requested by ${interaction.user.tag}`,
      });

      const task = ensureTask(channel.id, taskType, title, prompt);
      task.channelId = channel.id;
      saveTaskMemory();

      appendHistory(
        channel.id,
        'User',
        'discussion',
        `Initial request:\n${prompt}`
      );

      await interaction.editReply(`専用チャンネルを作成しました: ${channel}`);

      const startText = `新しいタスクを開始します。
      Type: ${taskType}
      Title: ${title}

      ここからチームが自律的に会議して、必要なら実行まで進めます。`;

      setTimeout(async () => {
        try {
          await sendAsBot(coordinator, channel.id, startText, 'Coordinator');
          appendHistory(channel.id, 'Coordinator', 'control', startText);

          await runDynamicMeeting(channel, prompt, 'start');
        } catch (error) {
          console.error(error);

          try {
          await sendAsBot(
          coordinator,
          channel.id,
          `処理中にエラーが発生しました: ${error.message}`,
          'Coordinator'
        );
        } catch (innerError) {
          console.error('Failed to send error message to task channel:', innerError);
        }
    }
  }, 0);

    return;
  }

  if (interaction.commandName === 'continue') {
    const prompt = interaction.options.getString('prompt', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      if (
        !interaction.channel ||
        interaction.channel.type !== ChannelType.GuildText
      ) {
        await interaction.editReply('タスクチャンネル内で使って。');
        return;
      }

      const task = getTask(interaction.channel.id);
      if (!task) {
        await interaction.editReply('このチャンネルにタスク情報がありません。');
        return;
      }

      task.cycleCount = 0;
      saveTaskMemory();

      appendHistory(
        interaction.channel.id,
        'User',
        'execution',
        `User follow-up:\n${prompt}`
      );

      await interaction.editReply('追加の自律会議を開始します。');
      await runDynamicMeeting(interaction.channel, prompt, 'continue');
    } catch (error) {
      console.error(error);
      await interaction.editReply(`エラー: ${error.message}`);
    }

    return;
  }

  if (interaction.commandName === 'resume') {
    await interaction.deferReply({ ephemeral: true });

    try {
      if (
        !interaction.channel ||
        interaction.channel.type !== ChannelType.GuildText
      ) {
        await interaction.editReply('タスクチャンネル内で使って。');
        return;
      }

      const task = getTask(interaction.channel.id);
      if (!task) {
        await interaction.editReply('このチャンネルに保存済みタスク情報がありません。');
        return;
      }

      await interaction.editReply('保存済みメモリから再開します。');
      await runResume(interaction.channel);
    } catch (error) {
      console.error(error);
      await interaction.editReply(`エラー: ${error.message}`);
    }

    return;
  }

  if (interaction.commandName === 'finish') {
    if (
      !interaction.channel ||
      interaction.channel.type !== ChannelType.GuildText
    ) {
      await interaction.reply('通常のタスクチャンネル内で使って。');
      return;
    }

    taskMemory.delete(interaction.channel.id);
    saveTaskMemory();
    await interaction.reply('タスク終了。');
  }
});

coordinator.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content?.startsWith('/')) return;

    const decision = await shouldAutoRespond(message);

    if (!decision.shouldRespond) {
      return;
    }

    const channelName = message.channel?.name || '';

    if (channelName.startsWith('task-')) {
      const task = getTask(message.channel.id);

      if (!task) {
        const text = 'このチャンネルに保存済みタスクがありません。';
        await sendAsBot(coordinator, message.channel.id, text, 'Coordinator');
        return;
      }

      task.cycleCount = 0;
      saveTaskMemory();

      appendHistory(
        message.channel.id,
        'User',
        'execution',
        `User normal message:\n${message.content.trim()}`
      );

      const text = '通常メッセージを新しい指示として受け取りました。会議を再開します。';
      await sendAsBot(coordinator, message.channel.id, text, 'Coordinator');
      appendHistory(message.channel.id, 'Coordinator', 'control', text);

      await runDynamicMeeting(
        message.channel,
        message.content.trim(),
        'normal-message'
      );

      return;
    }

    if (decision.isNewTask) {
      const ack = '依頼として受け取りました。専用チャンネルを作って進めます。';
      await message.reply(ack);

      await autoCreateTaskFromMessage(message);
    }
  } catch (error) {
    console.error('messageCreate error:', error);
  }
});

(async () => {
  try {
    await loadTaskMemory();
    await loadUserProfile();

    await Promise.all([
      scout.login(SCOUT_BOT_TOKEN),
      spark.login(SPARK_BOT_TOKEN),
      forge.login(FORGE_BOT_TOKEN),
      mirror.login(MIRROR_BOT_TOKEN),
      coordinator.login(COORDINATOR_BOT_TOKEN),
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();