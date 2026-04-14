import { nowIso } from '../utils/time.js';
import { taskMemory } from '../state/runtime-state.js';

let scheduleTaskMemorySaveHook = () => {};

export function setTaskModelHooks({ scheduleTaskMemorySave }) {
  scheduleTaskMemorySaveHook = scheduleTaskMemorySave;
}

export function normalizeTask(task, fallback = {}) {
  const base = {
    taskType: 'general',
    title: '',
    originalTitle: '',
    prompt: '',
    scoutEvidence: '',
    summary: '',
    historySummary: '',
    lastExecution: '',
    cycleCount: 0,
    channelId: '',
    history: [],
    status: 'idle',
    activeSpeaker: 'none',
    runId: '',
    lastUpdatedAt: nowIso(),
    openQuestions: [],
    nextActions: [],
    decisionLog: [],
    ...fallback,
    ...task,
  };

  base.history = Array.isArray(base.history) ? base.history : [];
  base.openQuestions = Array.isArray(base.openQuestions) ? base.openQuestions : [];
  base.nextActions = Array.isArray(base.nextActions) ? base.nextActions : [];
  base.decisionLog = Array.isArray(base.decisionLog) ? base.decisionLog : [];

  return base;
}

export function upsertNormalizedTask(channelId, partialTask, fallback = {}) {
  const normalized = normalizeTask(partialTask, fallback);
  taskMemory.set(channelId, normalized);
  return normalized;
}

export function touchTask(task, updates = {}) {
  const channelId = typeof task === 'string' ? task : task?.channelId;
  if (!channelId) return;

  const canonical = taskMemory.get(channelId);
  if (!canonical) return;

  Object.assign(canonical, updates);
  canonical.lastUpdatedAt = nowIso();
  scheduleTaskMemorySaveHook();
}

export function ensureTask(channelId, taskType, title, prompt) {
  const existing = taskMemory.get(channelId);
  if (existing) return existing;

  const task = upsertNormalizedTask(channelId, {
    taskType,
    title,
    originalTitle: title,
    prompt,
    channelId,
    status: 'idle',
  });
  scheduleTaskMemorySaveHook();
  return task;
}

export function getTask(channelId) {
  return taskMemory.get(channelId);
}
