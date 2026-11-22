import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { sparkSystem } from './prompts.js';

export function runSpark(basePrompt) {
  return askGroq(sparkSystem, basePrompt, { model: TEXT_MODEL, temperature: 0.7, max_tokens: 700 });
}
