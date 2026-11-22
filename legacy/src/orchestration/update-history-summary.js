import { askGroq } from '../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../app/constants.js';
import { getTask, touchTask } from '../domain/task-model.js';
import { buildHistoryContext } from './context-builders.js';

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

export async function updateHistorySummary(channelId) {
  const task = getTask(channelId);
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

export function isProviderFailureTextFromOutput(text) {
  return isProviderFailureText(text);
}
