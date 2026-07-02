import './helpers/stub-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
// src/index.js is the entry point with startup side effects (health server,
// Discord logins); everything else must be importable without side effects.
const SKIP = new Set([path.join(SRC_ROOT, 'index.js')]);

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

test('every module under src/ loads without crashing', async () => {
  const files = collectJsFiles(SRC_ROOT).filter(file => !SKIP.has(file));
  assert.ok(files.length > 30, `expected a full module tree, got ${files.length} files`);

  for (const file of files) {
    await assert.doesNotReject(
      import(pathToFileURL(file).href),
      `failed to import ${path.relative(process.cwd(), file)}`
    );
  }
});
