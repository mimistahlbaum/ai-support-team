import './helpers/stub-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asUntrustedContent, buildHistoryContext, buildUserProfileContext } from '../src/orchestration/context-builders.js';
import { deriveListsFromTurn } from '../src/orchestration/derive-state.js';
import { isProviderFailureTextFromOutput } from '../src/orchestration/update-history-summary.js';
import { shouldAutoRespond } from '../src/orchestration/routing.js';
import { getRunState } from '../src/state/in-memory-run-queue.js';
import { createEnqueueMeetingRun } from '../src/orchestration/enqueue-run.js';
import { ensureTask } from '../src/domain/task-model.js';
import { sleep } from '../src/utils/time.js';

test('asUntrustedContent wraps text with source label', () => {
  const wrapped = asUntrustedContent('discord_message', 'hello');
  assert.match(wrapped, /<untrusted_content source="discord_message">/);
  assert.match(wrapped, /hello/);
  assert.match(wrapped, /<\/untrusted_content>/);
  assert.match(asUntrustedContent('x', null), /<untrusted_content source="x">/);
});

test('buildHistoryContext handles missing tasks', () => {
  assert.equal(buildHistoryContext('orc-chan-missing'), 'No prior history.');
});

test('buildUserProfileContext handles empty profiles', () => {
  assert.equal(buildUserProfileContext(), 'No user profile available.');
});

test('isProviderFailureTextFromOutput detects provider errors only', () => {
  assert.equal(isProviderFailureTextFromOutput('Groq error: rate limited'), true);
  assert.equal(isProviderFailureTextFromOutput('Scout error: 500'), true);
  assert.equal(isProviderFailureTextFromOutput('通常の返答です'), false);
});

test('deriveListsFromTurn clears lists when task is complete', () => {
  const task = ensureTask('orc-chan-1', 'general', 'Title', 'Prompt');
  task.openQuestions = ['old question'];
  task.nextActions = ['old action'];

  deriveListsFromTurn(task, { taskComplete: true, reason: 'done', nextSpeaker: 'none', mode: 'discussion', nextInstruction: '' }, 'thanks');

  assert.deepEqual(task.openQuestions, []);
  assert.deepEqual(task.nextActions, []);
});

test('deriveListsFromTurn records next actions for ongoing turns', () => {
  const task = ensureTask('orc-chan-2', 'general', 'Title', 'Prompt');
  deriveListsFromTurn(
    task,
    { taskComplete: false, reason: 'needs work', nextSpeaker: 'Forge', mode: 'execution', nextInstruction: 'Draft the outline' },
    'Can you draft it?'
  );
  assert.ok(task.nextActions.includes('Draft the outline'));
  assert.ok(task.nextActions.includes('Forge to proceed in execution mode'));
  assert.ok(task.openQuestions.some(q => q.includes('Can you draft it?')));
});

function fakeMessage(content, channelName) {
  return { content, channel: { name: channelName } };
}

test('shouldAutoRespond ignores empty messages', async () => {
  const decision = await shouldAutoRespond(fakeMessage('', 'general'));
  assert.equal(decision.shouldRespond, false);
});

test('shouldAutoRespond accepts !continue commands in task channels', async () => {
  const decision = await shouldAutoRespond(fakeMessage('!continue draft the plan', 'task-abc'));
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.isNewTask, false);
});

test('shouldAutoRespond ignores plain chat in task channels', async () => {
  const decision = await shouldAutoRespond(fakeMessage('nice work everyone', 'task-abc'));
  assert.equal(decision.shouldRespond, false);
});

test('shouldAutoRespond prefilters trivial messages without calling the LLM', async () => {
  for (const content of ['ok', '了解', '👍👍', 'https://example.com', 'lol']) {
    const decision = await shouldAutoRespond(fakeMessage(content, 'general'));
    assert.equal(decision.shouldRespond, false, `expected trivial: ${content}`);
  }
});

test('getRunState returns the same state object per channel', () => {
  const a = getRunState('orc-queue-1');
  const b = getRunState('orc-queue-1');
  assert.equal(a, b);
  assert.deepEqual(a, { running: false, queue: [] });
});

test('enqueueMeetingRun runs queued prompts sequentially', async () => {
  const channelId = 'orc-queue-2';
  const fakeChannel = { id: channelId, send: async () => {} };
  const fakeCoordinator = {
    channels: { cache: new Map([[channelId, fakeChannel]]) },
    user: { tag: 'coordinator#0' },
  };

  const events = [];
  const executeMeetingRun = async (channel, prompt) => {
    events.push(`start:${prompt}`);
    await sleep(20);
    events.push(`end:${prompt}`);
  };

  const enqueue = createEnqueueMeetingRun({ coordinator: fakeCoordinator, executeMeetingRun });
  await Promise.all([
    enqueue(fakeChannel, 'first', 'start'),
    enqueue(fakeChannel, 'second', 'continue'),
  ]);

  assert.deepEqual(events, ['start:first', 'end:first', 'start:second', 'end:second']);
  assert.equal(getRunState(channelId).running, false);
  assert.equal(getRunState(channelId).queue.length, 0);
});
