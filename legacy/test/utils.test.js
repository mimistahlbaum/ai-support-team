import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, splitLongText } from '../src/utils/text.js';
import { formatError } from '../src/utils/errors.js';
import { makeRunId } from '../src/utils/ids.js';
import { retryAsync } from '../src/utils/retry.js';
import { withTimeout } from '../src/utils/timeout.js';
import { sleep } from '../src/utils/time.js';
import { DISCORD_SAFE_LIMIT } from '../src/app/constants.js';

test('clip returns empty string for falsy input', () => {
  assert.equal(clip(''), '');
  assert.equal(clip(null), '');
});

test('clip truncates long text with marker', () => {
  assert.equal(clip('abcdef', 3), 'abc ...');
  assert.equal(clip('abc', 3), 'abc');
});

test('splitLongText returns placeholder for empty text', () => {
  assert.deepEqual(splitLongText(''), ['(no response)']);
});

test('splitLongText keeps short text as single chunk', () => {
  assert.deepEqual(splitLongText('hello'), ['hello']);
});

test('splitLongText keeps every chunk within the Discord limit', () => {
  const text = 'a'.repeat(4000);
  const chunks = splitLongText(text);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= DISCORD_SAFE_LIMIT);
  }
  assert.equal(chunks.join(''), text);
});

test('splitLongText prefers paragraph boundaries', () => {
  const paragraph = 'b'.repeat(1000);
  const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
  const chunks = splitLongText(text);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= DISCORD_SAFE_LIMIT);
  }
});

test('formatError prefers stack, then message, then string', () => {
  const withStack = new Error('boom');
  assert.equal(formatError(withStack), withStack.stack);
  assert.equal(formatError({ message: 'msg only' }), 'msg only');
  assert.equal(formatError('plain'), 'plain');
});

test('makeRunId embeds the channel id and stays unique', () => {
  const a = makeRunId('chan1');
  const b = makeRunId('chan1');
  assert.match(a, /^chan1-\d+-[a-z0-9]+$/);
  assert.notEqual(a, b);
});

test('retryAsync succeeds after transient failures', async () => {
  let attempts = 0;
  const result = await retryAsync(async () => {
    attempts++;
    if (attempts < 3) throw new Error('transient');
    return 'ok';
  }, { retries: 2, delayMs: 1, label: 'test-op' });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('retryAsync throws after exhausting retries', async () => {
  await assert.rejects(
    retryAsync(async () => { throw new Error('always'); }, { retries: 1, delayMs: 1, label: 'test-op' }),
    /test-op failed after retries: always/
  );
});

test('withTimeout resolves fast operations', async () => {
  const result = await withTimeout(() => Promise.resolve(42), 500, 'fast');
  assert.equal(result, 42);
});

test('withTimeout rejects slow operations', async () => {
  await assert.rejects(
    withTimeout(() => sleep(200), 10, 'slow-op'),
    /slow-op timeout after 10ms/
  );
});
