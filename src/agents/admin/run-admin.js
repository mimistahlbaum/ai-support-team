import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { adminSystem } from './prompts.js';

export function runAdmin(basePrompt, taskSummary) {
  return askGroq(adminSystem, `${basePrompt}\n前回までの要約:\n${taskSummary || 'なし'}`, {
    model: TEXT_MODEL,
    temperature: 0.4,
    max_tokens: 1000,
  });
}
