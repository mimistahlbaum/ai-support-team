import './helpers/stub-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeChannelName } from '../src/discord/channel-factory.js';

test('safeChannelName slugifies plain titles', () => {
  assert.equal(safeChannelName('My Task!'), 'task-my-task');
  assert.equal(safeChannelName('  Grant  Application 2026  '), 'task-grant-application-2026');
});

test('safeChannelName keeps non-latin letters', () => {
  assert.equal(safeChannelName('ウェブサイト改修'), 'task-ウェブサイト改修');
});

test('safeChannelName falls back to timestamp for unusable titles', () => {
  assert.match(safeChannelName('!!!'), /^task-\d{14}$/);
  assert.match(safeChannelName(''), /^task-\d{14}$/);
});

test('safeChannelName stays within Discord length limits', () => {
  const name = safeChannelName('a'.repeat(300));
  assert.ok(name.length <= 95);
  assert.ok(name.startsWith('task-'));
});
