import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { mirrorSystem } from './prompts.js';

export function runMirror(basePrompt) {
  return askGroq(mirrorSystem, basePrompt, { model: TEXT_MODEL, temperature: 0.4, max_tokens: 700 });
}
