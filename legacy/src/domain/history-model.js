import { nowIso } from '../utils/time.js';
import { taskMemory } from '../state/runtime-state.js';

let scheduleTaskMemorySaveHook = () => {};

export function setHistoryModelHooks({ scheduleTaskMemorySave }) {
  scheduleTaskMemorySaveHook = scheduleTaskMemorySave;
}

export function appendHistory(channelId, role, mode, content) {
  const task = taskMemory.get(channelId);
  if (!task) return;

  task.history.push({ role, mode, content, timestamp: nowIso() });
  if (task.history.length > 120) task.history = task.history.slice(-120);

  task.lastUpdatedAt = nowIso();
  scheduleTaskMemorySaveHook();
}

export function addDecision(task, item) {
  task.decisionLog.push({ ...item, timestamp: nowIso() });
  if (task.decisionLog.length > 80) task.decisionLog = task.decisionLog.slice(-80);
}

export function setOpenQuestions(task, items) {
  task.openQuestions = (Array.isArray(items) ? items : []).slice(0, 20);
}

export function setNextActions(task, items) {
  task.nextActions = (Array.isArray(items) ? items : []).slice(0, 20);
}
