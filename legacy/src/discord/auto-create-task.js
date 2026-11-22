import { sendAsBot } from './send-message.js';
import { createTaskChannel } from './channel-factory.js';
import { ensureTask, touchTask } from '../domain/task-model.js';
import { appendHistory } from '../domain/history-model.js';
import { classifyTaskType } from '../orchestration/routing.js';

export function createAutoCreateTaskFromMessage({ coordinator, enqueueMeetingRun }) {
  return async function autoCreateTaskFromMessage(message) {
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
  };
}
