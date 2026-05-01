import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL, MAX_DYNAMIC_TURNS } from '../../app/constants.js';
import { mirrorSystem } from './prompts.js';
import { buildMirrorReviewInstruction } from './review-verdict.js';

export function runMirror(basePrompt, cycleCount = 0, deliverableType = null) {
  const turnContext = cycleCount > 0
    ? `\n\n現在のターン: ${cycleCount}/${MAX_DYNAMIC_TURNS}（ターン数が多いほどループに注意）`
    : '';
  const reviewInstruction = buildMirrorReviewInstruction(deliverableType, cycleCount);
  return askGroq(mirrorSystem, basePrompt + turnContext + reviewInstruction, {
    model: TEXT_MODEL,
    temperature: 0.4,
    max_tokens: 900,
  });
}
