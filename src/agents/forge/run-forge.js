import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { forgeSystem } from './prompts.js';

export function runForge(basePrompt, taskSummary) {
  return askGroq(forgeSystem, `${basePrompt}\n前回までの要約:\n${taskSummary || 'なし'}`, {
    model: TEXT_MODEL,
    temperature: 0.5,
    max_tokens: 900,
  });
}
