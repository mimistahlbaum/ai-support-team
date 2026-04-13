import { sendAsBot, safeCoordinatorStop } from '../discord/send-message.js';
import { appendHistory } from '../domain/history-model.js';
import { getTask, touchTask } from '../domain/task-model.js';

export function createRunResume({ coordinator, enqueueMeetingRun }) {
  return async function runResume(channel) {
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
  };
}
