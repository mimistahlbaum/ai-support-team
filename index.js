import http from 'http';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
} from 'discord.js';
import {
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
} from './src/app/env.js';
import {
  PORT,
  MAX_DYNAMIC_TURNS,
  REQUEST_TIMEOUT_MS,
  API_RETRIES,
} from './src/app/constants.js';
import { formatError } from './src/utils/errors.js';
import { withTimeout } from './src/utils/timeout.js';
import { retryAsync } from './src/utils/retry.js';
import { makeRunId } from './src/utils/ids.js';
import { sendAsBot, safeCoordinatorStop } from './src/discord/send-message.js';
import { createTaskChannel } from './src/discord/channel-factory.js';
import { getRunState } from './src/state/in-memory-run-queue.js';
import { taskMemory, saveState, getIsShuttingDown, setIsShuttingDown } from './src/state/runtime-state.js';
import { ensureTask, getTask, touchTask, setTaskModelHooks } from './src/domain/task-model.js';
import {
  appendHistory,
  addDecision,
  setOpenQuestions,
  setNextActions,
  setHistoryModelHooks,
} from './src/domain/history-model.js';
import { deriveListsFromTurn } from './src/orchestration/derive-state.js';
import { shouldAutoRespond, classifyTaskType } from './src/orchestration/routing.js';
import { askCoordinatorNextStep } from './src/agents/coordinator/decide-next-step.js';
import { askCoordinatorFinalSummary } from './src/agents/coordinator/final-summary.js';
import { askAgentResponse } from './src/agents/run-agent-response.js';
import { updateHistorySummary, isProviderFailureTextFromOutput } from './src/orchestration/update-history-summary.js';
import { loadTaskMemory, flushTaskMemory, scheduleTaskMemorySave } from './src/services/storage/task-repository.js';
import { loadUserProfile, saveUserProfile } from './src/services/storage/user-profile-repository.js';

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

setTaskModelHooks({ scheduleTaskMemorySave });
setHistoryModelHooks({ scheduleTaskMemorySave });

// =========================================================
// meeting orchestration
// =========================================================


function roleClient(role) {
  if (role === 'Scout') return scout;
  if (role === 'Spark') return spark;
  if (role === 'Forge') return forge;
  if (role === 'Mirror') return mirror;
  return coordinator;
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

async function executeMeetingRun(channel, latestUserPrompt, invocationMode) {
  const task = getTask(channel.id);

  if (!task) {
    await safeCoordinatorStop(coordinator, channel.id, 'このチャンネルにタスク情報がありません。新しく /starttask してください。');
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

      if (isProviderFailureTextFromOutput(output)) {
        touchTask(task, { status: 'error', activeSpeaker: 'none' });
        const stopText = '外部APIの失敗が続いたため安全停止します。しばらく待ってから /continue または /resume を使ってください。';
        await safeCoordinatorStop(coordinator, channel.id, stopText);
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
    await safeCoordinatorStop(coordinator, channel.id, stopText);
    appendHistory(channel.id, 'Coordinator', 'control', stopText);
    scheduleTaskMemorySave({ immediate: true });
  } catch (error) {
    console.error('executeMeetingRun failed:', error.message || error);
    touchTask(task, { status: 'error', activeSpeaker: 'none' });
    await safeCoordinatorStop(coordinator, channel.id, `実行中にエラーが発生したため停止しました: ${error.message}`);
    appendHistory(channel.id, 'Coordinator', 'control', `Run error: ${error.message}`);
    scheduleTaskMemorySave({ immediate: true });
  }
}

async function runResume(channel) {
  const task = getTask(channel.id);
  if (!task) {
    await safeCoordinatorStop(coordinator, channel.id, 'このチャンネルの保存済みタスクが見つかりません。');
    return;
  }

  const resumeText = `保存済みメモリから再開します。\n\nstatus: ${task.status}\ntaskType: ${task.taskType}\ntitle: ${task.title}\n\nlatest summary:\n${task.summary || 'なし'}\n\nhistory summary:\n${task.historySummary || 'なし'}\n\nopenQuestions:\n${(task.openQuestions || []).join('\n') || 'なし'}\n\nnextActions:\n${(task.nextActions || []).join('\n') || 'なし'}\n\nlast execution:\n${task.lastExecution || 'なし'}`;

  await sendAsBot(coordinator, channel.id, resumeText, 'Coordinator');
  appendHistory(channel.id, 'Coordinator', 'resume', resumeText);

  touchTask(task, { cycleCount: 0, status: 'idle' });

  const resumePrompt = `保存済みメモリを踏まえて、このタスクを再開してください。\n\n元の依頼:\n${task.prompt}\n\n現在の要約:\n${task.summary || 'なし'}\n\nopenQuestions:\n${(task.openQuestions || []).join('\n') || 'なし'}\n\nnextActions:\n${(task.nextActions || []).join('\n') || 'なし'}\n\n必要なら修正、補強、続行を行ってください。`;

  await enqueueMeetingRun(channel, resumePrompt, 'resume');
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
  if (getIsShuttingDown()) return;
  setIsShuttingDown(true);
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
