import { nowIso } from '../utils/time.js';
import { taskMemory } from '../state/runtime-state.js';

let scheduleTaskMemorySaveHook = () => {};

/** @param {{ scheduleTaskMemorySave: () => void }} hooks */
export function setTaskModelHooks({ scheduleTaskMemorySave }) {
  scheduleTaskMemorySaveHook = scheduleTaskMemorySave;
}

/**
 * Merge a partial task object with defaults, producing a fully-shaped task.
 * @param {Partial<import('./task-types.js').Task>} task
 * @param {Partial<import('./task-types.js').Task>} [fallback]
 * @returns {import('./task-types.js').Task}
 */
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
    dueDate: null,
    openQuestions: [],
    nextActions: [],
    decisionLog: [],
    tags: [],
    blockedBy: [],   // channelId[] — tasks this task is waiting on
    blocks: [],      // channelId[] — tasks waiting on this task
    producedDeliverableIds: [],
    activeDeliverableId: null,
    activeDeliverableType: null,
    // Structured request schema (#73)
    requestSchema: {
      goal: '',
      deliverable: '',
      deadline: null,
      constraints: [],
      owner: '',
      source: '',
    },
    ...fallback,
    ...task,
  };

  base.history = Array.isArray(base.history) ? base.history : [];
  base.openQuestions = Array.isArray(base.openQuestions) ? base.openQuestions : [];
  base.nextActions = Array.isArray(base.nextActions) ? base.nextActions : [];
  base.decisionLog = Array.isArray(base.decisionLog) ? base.decisionLog : [];
  base.tags = Array.isArray(base.tags) ? base.tags.filter(Boolean) : [];
  base.blockedBy = Array.isArray(base.blockedBy) ? base.blockedBy.filter(Boolean) : [];
  base.blocks = Array.isArray(base.blocks) ? base.blocks.filter(Boolean) : [];
  base.producedDeliverableIds = Array.isArray(base.producedDeliverableIds)
    ? base.producedDeliverableIds.filter(Boolean)
    : [];

  return base;
}

// Record that a task produced a deliverable (idempotent). Updates lastUpdatedAt.
export function addProducedDeliverable(channelId, deliverableId) {
  const task = taskMemory.get(channelId);
  if (!task || !deliverableId) return false;
  const ids = Array.isArray(task.producedDeliverableIds) ? task.producedDeliverableIds : [];
  if (!ids.includes(deliverableId)) {
    ids.push(deliverableId);
    touchTask(task, { producedDeliverableIds: ids });
  }
  return true;
}

// Silent backfill variant — does NOT update lastUpdatedAt.
// Used at startup to populate historical links without dirtying task timestamps.
// Returns true only if the deliverableId was newly added.
export function backfillProducedDeliverable(channelId, deliverableId) {
  const task = taskMemory.get(channelId);
  if (!task || !deliverableId) return false;
  const ids = Array.isArray(task.producedDeliverableIds) ? task.producedDeliverableIds : [];
  if (ids.includes(deliverableId)) return false;
  ids.push(deliverableId);
  task.producedDeliverableIds = ids;
  return true;
}

// Set the "active" deliverable for a task channel (used by execute-run for deliverableId-first binding).
// Pass null to clear.
export function setActiveDeliverable(channelId, deliverableId) {
  const task = taskMemory.get(channelId);
  if (!task) return false;
  touchTask(task, { activeDeliverableId: deliverableId || null });
  return true;
}

// Read the active deliverable ID for a task channel without touching state.
export function getActiveDeliverableId(channelId) {
  return taskMemory.get(channelId)?.activeDeliverableId || null;
}

// Expose the save hook so callers can trigger a persist after bulk operations.
export function requestTaskMemorySave() {
  scheduleTaskMemorySaveHook();
}

export function upsertNormalizedTask(channelId, partialTask, fallback = {}) {
  const normalized = normalizeTask(partialTask, fallback);
  taskMemory.set(channelId, normalized);
  return normalized;
}

/**
 * Apply updates to a task and bump lastUpdatedAt. Schedules a save.
 * @param {object|string} task - Task object or channelId string
 * @param {object} [updates]
 */
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

/** @param {string} channelId @returns {object|undefined} */
export function getTask(channelId) {
  return taskMemory.get(channelId);
}

/** @returns {object[]} All tasks currently in memory */
export function getAllTasks() {
  return Array.from(taskMemory.values());
}

// On startup: reset any tasks left in 'running' state by a previous crash.
// Returns the count of tasks reset so callers can log it.
export function resetStaleRunningTasks() {
  let count = 0;
  for (const task of taskMemory.values()) {
    if (task.status === 'running') {
      task.status = 'error';
      task.activeSpeaker = 'none';
      task.lastUpdatedAt = nowIso();
      count++;
    }
  }
  return count;
}
