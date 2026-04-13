import { clip } from '../utils/text.js';
import { setOpenQuestions, setNextActions } from '../domain/history-model.js';

export function deriveListsFromTurn(task, next, latestUserPrompt) {
  if (next.taskComplete) {
    setOpenQuestions(task, []);
    setNextActions(task, []);
    return;
  }

  const q = [];
  if (next.reason.includes('未決定') || next.reason.toLowerCase().includes('unknown')) {
    q.push(next.reason);
  }
  if (latestUserPrompt.includes('?') || latestUserPrompt.includes('？')) {
    q.push(clip(latestUserPrompt, 140));
  }

  const actions = [];
  if (next.nextInstruction) actions.push(clip(next.nextInstruction, 220));
  actions.push(`${next.nextSpeaker} to proceed in ${next.mode} mode`);

  setOpenQuestions(task, Array.from(new Set([...task.openQuestions, ...q])).slice(-10));
  setNextActions(task, Array.from(new Set(actions)).slice(-10));
}
