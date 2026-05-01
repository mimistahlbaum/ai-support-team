import { askGroq } from '../../services/llm/ask-groq.js';
import { TEXT_MODEL } from '../../app/constants.js';
import { forgeSystem } from './prompts.js';
import { buildForgeInstruction } from './output-templates.js';

export function runForge(basePrompt, taskSummary, taskType = '', deliverableType = null, version = 1) {
  const templateInstruction = buildForgeInstruction(taskType, deliverableType, version);
  const userContent = [
    basePrompt,
    `前回までの要約:\n${taskSummary || 'なし'}`,
    templateInstruction,
  ].join('\n');

  return askGroq(forgeSystem, userContent, {
    model: TEXT_MODEL,
    temperature: 0.5,
    max_tokens: 900,
  });
}
