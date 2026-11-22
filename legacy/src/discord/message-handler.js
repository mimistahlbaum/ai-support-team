import { sendAsBot } from './send-message.js';
import { getTask, touchTask } from '../domain/task-model.js';
import { appendHistory } from '../domain/history-model.js';
import { shouldAutoRespond } from '../orchestration/routing.js';

export function attachMessageHandler({ coordinator, enqueueMeetingRun, autoCreateTaskFromMessage }) {
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
}
