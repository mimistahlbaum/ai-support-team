import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { coordinatorSystem } from './prompts.js';
import { taskTypeHint } from '../../domain/decision-model.js';
import { buildHistoryContext, buildUserProfileContext } from '../../orchestration/context-builders.js';

export async function askCoordinatorFinalSummary(task, latestUserPrompt) {
  return askGroq(
    coordinatorSystem,
    `タスク種別:\n${task.taskType}\n補足:\n${taskTypeHint(task.taskType)}\nユーザープロフィール:\n${buildUserProfileContext()}\n元の依頼:\n${task.prompt}\n最新の追加依頼:\n${latestUserPrompt}\n圧縮された履歴要約:\n${task.historySummary || 'No summary.'}\n最近の履歴:\n${buildHistoryContext(task.channelId, 12)}`,
    { model: TEXT_MODEL, temperature: 0.4, max_tokens: 700 }
  );
}
