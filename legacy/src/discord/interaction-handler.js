import { ChannelType } from 'discord.js';
import { createTaskChannel } from './channel-factory.js';
import { ensureTask, getTask, touchTask } from '../domain/task-model.js';
import { appendHistory, addDecision } from '../domain/history-model.js';
import { taskMemory } from '../state/runtime-state.js';
import { scheduleTaskMemorySave } from '../services/storage/task-repository.js';

export function attachInteractionHandler({ coordinator, enqueueMeetingRun, runResume }) {
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
}
