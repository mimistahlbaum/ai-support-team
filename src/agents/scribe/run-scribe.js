import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { scriveSystem } from './prompts.js';

export function runScribe(basePrompt, taskSummary) {
  return askGroq(scriveSystem, `${basePrompt}\n前回までの要約:\n${taskSummary || 'なし'}`, {
    model: TEXT_MODEL,
    temperature: 0.7,
    max_tokens: 1200,
  });
}
