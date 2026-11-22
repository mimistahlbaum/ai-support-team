import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTask, ensureTask, getTask, touchTask } from '../src/domain/task-model.js';
import { appendHistory, addDecision, setOpenQuestions, setNextActions } from '../src/domain/history-model.js';
import { taskTypeHint } from '../src/domain/decision-model.js';
import { taskMemory } from '../src/state/runtime-state.js';

test('normalizeTask fills defaults and coerces non-array fields', () => {
  const task = normalizeTask({ title: 'T', history: 'broken', openQuestions: null });
  assert.equal(task.title, 'T');
  assert.equal(task.taskType, 'general');
  assert.equal(task.status, 'idle');
  assert.deepEqual(task.history, []);
  assert.deepEqual(task.openQuestions, []);
  assert.deepEqual(task.nextActions, []);
  assert.deepEqual(task.decisionLog, []);
});

test('ensureTask creates once and returns the existing task afterwards', () => {
  const first = ensureTask('domain-chan-1', 'research', 'Title', 'Prompt');
  const second = ensureTask('domain-chan-1', 'admin', 'Other', 'Other');
  assert.equal(first, second);
  assert.equal(second.taskType, 'research');
  assert.equal(getTask('domain-chan-1'), first);
});

test('touchTask applies updates and bumps lastUpdatedAt', () => {
  const task = ensureTask('domain-chan-2', 'general', 'Title', 'Prompt');
  const before = task.lastUpdatedAt;
  touchTask(task, { status: 'running', cycleCount: 3 });
  const updated = getTask('domain-chan-2');
  assert.equal(updated.status, 'running');
  assert.equal(updated.cycleCount, 3);
  assert.ok(updated.lastUpdatedAt >= before);
});

test('touchTask ignores tasks without a channel id', () => {
  assert.equal(touchTask({}, { status: 'running' }), undefined);
});

test('appendHistory records entries and trims to 120', () => {
  const channelId = 'domain-chan-3';
  ensureTask(channelId, 'general', 'Title', 'Prompt');

  for (let i = 0; i < 130; i++) {
    appendHistory(channelId, 'User', 'discussion', `msg ${i}`);
  }

  const task = getTask(channelId);
  assert.equal(task.history.length, 120);
  assert.equal(task.history.at(-1).content, 'msg 129');
  assert.equal(task.history[0].content, 'msg 10');
});

test('appendHistory is a no-op for unknown channels', () => {
  appendHistory('domain-chan-missing', 'User', 'discussion', 'msg');
  assert.equal(taskMemory.has('domain-chan-missing'), false);
});

test('addDecision trims decision log to 80', () => {
  const task = ensureTask('domain-chan-4', 'general', 'Title', 'Prompt');
  for (let i = 0; i < 90; i++) {
    addDecision(task, { event: `d${i}` });
  }
  assert.equal(task.decisionLog.length, 80);
  assert.equal(task.decisionLog.at(-1).event, 'd89');
});

test('setOpenQuestions and setNextActions cap list sizes', () => {
  const task = ensureTask('domain-chan-5', 'general', 'Title', 'Prompt');
  setOpenQuestions(task, Array.from({ length: 30 }, (_, i) => `q${i}`));
  setNextActions(task, 'not-an-array');
  assert.equal(task.openQuestions.length, 20);
  assert.deepEqual(task.nextActions, []);
});

test('taskTypeHint falls back to general for unknown types', () => {
  assert.equal(taskTypeHint('unknown-type'), taskTypeHint('general'));
  assert.notEqual(taskTypeHint('research'), taskTypeHint('general'));
});
