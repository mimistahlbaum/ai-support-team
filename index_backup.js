import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_WEBHOOK_URL,
  GEMINI_API_KEY,
  GROQ_API_KEY,
  OPENROUTER_API_KEY,
  TAVILY_API_KEY,
} = process.env;

if (
  !DISCORD_TOKEN ||
  !DISCORD_CLIENT_ID ||
  !DISCORD_GUILD_ID ||
  !DISCORD_WEBHOOK_URL ||
  !GEMINI_API_KEY ||
  !GROQ_API_KEY ||
  !OPENROUTER_API_KEY ||
  !TAVILY_API_KEY
) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const openrouter = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const taskMemory = new Map();
const DISCORD_SAFE_LIMIT = 1800;
const MAX_TURNS = 8;

const commands = [
  new SlashCommandBuilder()
    .setName('starttask')
    .setDescription('Create a task thread and start the workflow')
    .addStringOption(option =>
      option
        .setName('task_type')
        .setDescription('Task type')
        .setRequired(true)
        .addChoices(
          { name: 'website', value: 'website' },
          { name: 'research', value: 'research' },
          { name: 'grant', value: 'grant' },
          { name: 'marketing', value: 'marketing' },
          { name: 'admin', value: 'admin' },
          { name: 'general', value: 'general' }
        )
    )
    .addStringOption(option =>
      option.setName('title').setDescription('Thread title').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('prompt').setDescription('Prompt').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('continue')
    .setDescription('Continue the current task thread')
    .addStringOption(option =>
      option.setName('prompt').setDescription('Follow-up').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('finish')
    .setDescription('Finish task')
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log('Slash command registered.');
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

async function sendWebhookMessage(thread, roleName, text) {
  const roleStyles = {
    Scout: {
      avatar_url:
        'https://api.dicebear.com/9.x/shapes/png?seed=Scout&backgroundColor=b6e3f4',
    },
    Spark: {
      avatar_url:
        'https://api.dicebear.com/9.x/shapes/png?seed=Spark&backgroundColor=ffd5dc',
    },
    Forge: {
      avatar_url:
        'https://api.dicebear.com/9.x/shapes/png?seed=Forge&backgroundColor=fde68a',
    },
    Mirror: {
      avatar_url:
        'https://api.dicebear.com/9.x/shapes/png?seed=Mirror&backgroundColor=d1d5db',
    },
    Coordinator: {
      avatar_url:
        'https://api.dicebear.com/9.x/shapes/png?seed=Coordinator&backgroundColor=c4b5fd',
    },
  };

  const chunks = splitLongText(text);
  const style = roleStyles[roleName] || roleStyles.Coordinator;

  for (let i = 0; i < chunks.length; i++) {
    const name = i === 0 ? roleName : `${roleName} (cont. ${i + 1})`;

    const payload = {
      content: chunks[i],
      username: name,
      avatar_url: style.avatar_url,
      thread_id: thread.id,
    };

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Webhook send failed: ${res.status} ${errorText}`);
    }
  }
}

function safeThreadName(taskType, title) {
  return `${taskType}-${title}`.replace(/\s+/g, '-').slice(0, 90);
}

function ensureTask(threadId, taskType = 'general', title = 'task', basePrompt = '') {
  if (!taskMemory.has(threadId)) {
    taskMemory.set(threadId, {
      taskType,
      title,
      basePrompt,
      turns: [],
      completedPhases: [],
      scoutEvidence: '',
    });
  }
  return taskMemory.get(threadId);
}

function clipForContext(text, max = 500) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + ' ...' : text;
}

function addTurn(threadId, turn) {
  const task = ensureTask(threadId);
  task.turns.push(turn);
  if (task.turns.length > MAX_TURNS) {
    task.turns.shift();
  }
}

function formatHistory(threadId) {
  const task = ensureTask(threadId);
  if (task.turns.length === 0) return '過去の会話はまだありません。';

  return task.turns
    .map((turn, i) => {
      return [
        `Turn ${i + 1}`,
        `Phase: ${turn.phase}`,
        `Prompt: ${clipForContext(turn.prompt, 250)}`,
        `Spark: ${clipForContext(turn.spark, 350)}`,
        `Forge: ${clipForContext(turn.forge, 350)}`,
      ].join('\n');
    })
    .join('\n\n');
}

function taskTypeHint(taskType) {
  const hints = {
    website:
      'ウェブサイト制作、情報設計、掲載文、ページ構成、デザイン方向性、実装手順を重視してください。',
    research:
      '研究構想、研究課題、理論枠組み、文献レビュー、方法論、章立て、実行計画を重視してください。',
    grant:
      '助成金申請、審査視点、説得力、実現可能性、活動内容、予算、締切や募集要項などの事実確認を重視してください。',
    marketing:
      '発信戦略、ターゲット、投稿案、ブランド整合性を重視してください。',
    admin:
      '実務処理、整理、テンプレート、手順化、抜け漏れ防止を重視してください。',
    general:
      '一般的な実務サポートとして対応してください。',
  };
  return hints[taskType] || hints.general;
}

function getWorkflowPhases(taskType, basePrompt) {
  const workflows = {
    website: [
      ['サイト全体コンセプト', 'サイトの目的、印象、強み、避ける方向を決める'],
      ['ページ構成', '必要ページ、導線、優先順位を決める'],
      ['トップページ詳細', '各セクションと掲載文を作る'],
      ['デザイン方向性', '色、余白、タイポ、画像方針を決める'],
      ['実装手順', '最低限の初版と実装順を決める'],
    ],
    research: [
      ['研究テーマ整理', '中心問いと意義を定義する'],
      ['理論と文献方向', '文献群と位置づけを整理する'],
      ['方法論', '方法と素材を整理する'],
      ['章立て', '論理構造を作る'],
      ['実行計画', '次にやる作業を決める'],
    ],
    grant: [
      ['企画の核', 'プロジェクトの核と意義を整理する'],
      ['審査視点整理', '強み弱みと説得軸を整理する'],
      ['活動計画', '実施方法と体制を詰める'],
      ['申請文下書き', '文章化する'],
      ['提出準備', '不足情報と次の実務を整理する'],
    ],
  };

  const phases = workflows[taskType] || [
    ['方向性整理', '複数案を整理する'],
    ['実務化', '実行可能な形にする'],
  ];

  return phases.map(([title, objective]) => ({
    title,
    objective,
    prompt: `元の依頼:\n${basePrompt}\n\nこのフェーズでは「${title}」を進めてください。目的: ${objective}`,
  }));
}

function shouldSearch(taskType, prompt, basePrompt = '') {
  const text = `${prompt}\n${basePrompt}`.toLowerCase();

  if (taskType === 'research' || taskType === 'grant') return true;

  const forceKeywords = [
    'mimi yoshii',
    'mimiyoshii',
    '公式',
    'official',
    '現在',
    'latest',
    'current',
    '締切',
    'deadline',
    'guideline',
    '募集要項',
    'プロフィール',
    'bio',
    'biography',
    'instagram',
    'website',
    'web site',
    'research profile',
  ];

  return forceKeywords.some(k => text.includes(k));
}

function buildSearchQuery(taskType, prompt, basePrompt = '') {
  const text = `${prompt}\n${basePrompt}`;

  if (/mimi yoshii|mimiyoshii/i.test(text)) {
    return 'Mimi Yoshii official website profile Instagram research performance';
  }

  if (taskType === 'grant') {
    return `${text}\nFind the current official grant information, guidelines, deadlines, eligibility, and application links.`;
  }

  if (taskType === 'research') {
    return `${text}\nFind official or credible public information and current research-related context.`;
  }

  if (taskType === 'website') {
    return `${text}\nFind official public information about the person, profile, website, Instagram, and public-facing activity.`;
  }

  return text;
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
      return {
        ok: false,
        text: `Scout error: Tavily returned ${res.status}. ${text}`,
      };
    }

    const data = await res.json();
    const answer = data.answer ? `Answer summary:\n${data.answer}\n\n` : '';
    const results = Array.isArray(data.results) ? data.results : [];

    if (results.length === 0) {
      return {
        ok: true,
        text: `${answer}No strong search results found.`,
      };
    }

    const lines = results.map((r, i) => {
      const title = r.title || 'Untitled';
      const url = r.url || '';
      const content = clipForContext(r.content || '', 350);
      return `${i + 1}. ${title}\nURL: ${url}\nNotes: ${content}`;
    });

    return {
      ok: true,
      text: `${answer}${lines.join('\n\n')}`,
    };
  } catch (error) {
    return {
      ok: false,
      text: `Scout error: ${error.message}`,
    };
  }
}

function isModelLimitError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('413') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('too large') ||
    msg.includes('insufficient') ||
    msg.includes('credit') ||
    msg.includes('timeout')
  );
}

async function askOpenRouter(systemPrompt, userPrompt) {
  const response = await openrouter.chat.completions.create({
    model: 'openrouter/free',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices?.[0]?.message?.content || '(no response)';
}

const sparkSystem = `
あなたの名前は Spark です。
役割はアイデア出しと最終チェックです。
複数案、方向性、視点を広げてください。
事実関係は Scout の検索結果だけを根拠にしてください。
検索結果が弱い、曖昧、または存在しない場合は、推測で埋めずに「不明」または「追加確認が必要」と明記してください。
`;

const forgeSystem = `
あなたの名前は Forge です。
役割は実務と指摘です。
使える形に落とし込み、不足点も率直に指摘してください。
事実関係は Scout の検索結果だけを根拠にしてください。
検索結果が弱い、曖昧、または存在しない場合は、推測で埋めずに「不明」または「追加確認が必要」と明記してください。
`;

async function askSpark(prompt, historyText, phaseTitle, phaseObjective, scoutEvidence) {
  const userPrompt = `
過去の会話:
${historyText}

Scoutの検索結果:
${scoutEvidence || '検索なし'}

現在フェーズ:
${phaseTitle}
目的:
${phaseObjective}

今回の依頼:
${prompt}
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

async function askForge(prompt, historyText, phaseTitle, phaseObjective, sparkText, scoutEvidence) {
  const userPrompt =
    `過去の会話:\n${historyText}\n\n` +
    `Scoutの検索結果:\n${scoutEvidence || '検索なし'}\n\n` +
    `現在フェーズ:\n${phaseTitle}\n目的:\n${phaseObjective}\n\n` +
    `今回の依頼:\n${prompt}\n\n` +
    `Sparkの案:\n${sparkText}`;

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

async function runPhase(thread, phase) {
  const task = ensureTask(thread.id);
  const historyText = formatHistory(thread.id);

  await sendWebhookMessage(
    thread,
    'Coordinator',
    `Phase: ${phase.title}\n目的: ${phase.objective}`
  );

  let scoutEvidence = '';
  if (shouldSearch(task.taskType, phase.prompt, task.basePrompt)) {
    const searchQuery = buildSearchQuery(task.taskType, phase.prompt, task.basePrompt);
    const scout = await searchTavily(searchQuery);
    scoutEvidence = scout.text;
    task.scoutEvidence = scoutEvidence;
    await sendWebhookMessage(thread, 'Scout', scoutEvidence);
  } else if (task.scoutEvidence) {
    scoutEvidence = task.scoutEvidence;
  }

  const sparkText = await askSpark(
    phase.prompt,
    historyText,
    phase.title,
    phase.objective,
    scoutEvidence
  );
  await sendWebhookMessage(thread, 'Spark', sparkText);

  const forgeText = await askForge(
    phase.prompt,
    historyText,
    phase.title,
    phase.objective,
    sparkText,
    scoutEvidence
  );
  await sendWebhookMessage(thread, 'Forge', forgeText);

  addTurn(thread.id, {
    phase: phase.title,
    prompt: phase.prompt,
    spark: sparkText,
    forge: forgeText,
  });

  task.completedPhases.push(phase.title);
}

async function runAutoWorkflow(thread) {
  const task = ensureTask(thread.id);
  const phases = getWorkflowPhases(task.taskType, task.basePrompt);

  for (const phase of phases) {
    if (task.completedPhases.includes(phase.title)) continue;
    await runPhase(thread, phase);
  }

  await sendWebhookMessage(
    thread,
    'Mirror',
    `自動ワークフロー完了。\n追加で詰めたいなら /continue、終わるなら /finish。`
  );
}

async function runContinue(thread, prompt) {
  const task = ensureTask(thread.id);
  const historyText = formatHistory(thread.id);

  let scoutEvidence = '';
  if (shouldSearch(task.taskType, prompt, task.basePrompt)) {
    const searchQuery = buildSearchQuery(task.taskType, prompt, task.basePrompt);
    const scout = await searchTavily(searchQuery);
    scoutEvidence = scout.text;
    task.scoutEvidence = scoutEvidence;
    await sendWebhookMessage(thread, 'Scout', scoutEvidence);
  } else if (task.scoutEvidence) {
    scoutEvidence = task.scoutEvidence;
  }

  const sparkText = await askSpark(
    prompt,
    historyText,
    '追加指示',
    'ユーザーの追加指示に対応する',
    scoutEvidence
  );
  await sendWebhookMessage(thread, 'Spark', sparkText);

  const forgeText = await askForge(
    prompt,
    historyText,
    '追加指示',
    'ユーザーの追加指示に対応する',
    sparkText,
    scoutEvidence
  );
  await sendWebhookMessage(thread, 'Forge', forgeText);

  addTurn(thread.id, {
    phase: '追加指示',
    prompt,
    spark: sparkText,
    forge: forgeText,
  });

  await sendWebhookMessage(
    thread,
    'Mirror',
    '追加指示の処理が終わりました。さらに進めるなら /continue、終わるなら /finish。'
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'starttask') {
    const taskType = interaction.options.getString('task_type', true);
    const title = interaction.options.getString('title', true);
    const prompt = interaction.options.getString('prompt', true);

    if (!interaction.channel || !('threads' in interaction.channel)) {
      await interaction.reply('このチャンネルではスレッド作成不可。');
      return;
    }

    await interaction.deferReply();

    const thread = await interaction.channel.threads.create({
      name: safeThreadName(taskType, title),
      autoArchiveDuration: 1440,
      reason: `Task by ${interaction.user.tag}`,
    });

    ensureTask(thread.id, taskType, title, prompt);

    await interaction.editReply(`スレッド作成: ${thread}`);

    await sendWebhookMessage(
      thread,
      'Coordinator',
      `Task started\nType: ${taskType}\nTitle: ${title}`
    );

    try {
      await runAutoWorkflow(thread);
    } catch (error) {
      console.error(error);
      await sendWebhookMessage(thread, 'Mirror', `Workflow error: ${error.message}`);
    }

    return;
  }

  if (interaction.commandName === 'continue') {
    const prompt = interaction.options.getString('prompt', true);

    if (!interaction.channel || !interaction.channel.isThread()) {
      await interaction.reply('スレッド内で使って。');
      return;
    }

    await interaction.deferReply();

    try {
      await interaction.editReply('続き開始');
      await runContinue(interaction.channel, prompt);
    } catch (error) {
      console.error(error);
      await interaction.followUp(`Workflow error: ${error.message}`);
    }

    return;
  }

  if (interaction.commandName === 'finish') {
    if (!interaction.channel || !interaction.channel.isThread()) {
      await interaction.reply('スレッド内で使って。');
      return;
    }

    taskMemory.delete(interaction.channel.id);
    await interaction.reply('タスク終了。');
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();