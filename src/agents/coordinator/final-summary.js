import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { coordinatorSystem } from './prompts.js';
import { taskTypeHint } from '../../domain/decision-model.js';
import { asUntrustedContent, buildHistoryContext, buildUserProfileContext } from '../../orchestration/context-builders.js';

export async function askCoordinatorFinalSummary(task, latestUserPrompt) {
  return askGroq(
    coordinatorSystem,
    `タスク種別:\n${task.taskType}\n補足:\n${taskTypeHint(task.taskType)}\nユーザープロフィール:\n${asUntrustedContent('user_profile', buildUserProfileContext())}\n元の依頼:\n${asUntrustedContent('original_prompt', task.prompt)}\n最新の追加依頼:\n${asUntrustedContent('latest_user_prompt', latestUserPrompt)}\n圧縮された履歴要約:\n${asUntrustedContent('history_summary', task.historySummary || 'No summary.')}\n最近の履歴:\n${asUntrustedContent('recent_history', buildHistoryContext(task.channelId, 12))}`,
    { model: TEXT_MODEL, temperature: 0.4, max_tokens: 700 }
  );
}
