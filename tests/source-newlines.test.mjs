import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { normalizeSourceNewlines } from '../scripts/source-newlines.mjs';
function removeFixture(root) {
  const target = resolve(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('career-newlines-')) throw new Error('Unexpected temporary fixture path');
  rmSync(target, { recursive: true, force: true });
}

test('M8-N01: normalize a Windows checkout without replacing local edits; idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-newlines-'));
  try {
    mkdirSync(join(root, 'apps')); writeFileSync(join(root, 'apps/edit.ts'), 'const 用户改动 = 123;\r\n// keep this change\r\n');
    assert.equal(normalizeSourceNewlines(root, ['apps/edit.ts', 'apps/deleted.ts'], new Set()), 1);
    assert.equal(readFileSync(join(root, 'apps/edit.ts'), 'utf8'), 'const 用户改动 = 123;\n// keep this change\n');
    assert.equal(normalizeSourceNewlines(root, ['apps/edit.ts'], new Set()), 0);
  } finally { removeFixture(root); }
});
test('M8-N02: never rewrite protected prototypes, documentation, binary/invalid UTF8 or untracked private data', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-newlines-'));
  try {
    mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'infra'));
    const files = new Map([['app.js', Buffer.from('prototype\r\n')], ['docs/old.json', Buffer.from('{}\r\n')], ['infra/binary.json', Buffer.from([255,0,13,10])], ['infra/private.json', Buffer.from('private\r\n')]]);
    for (const [name, value] of files) writeFileSync(join(root, name), value);
    assert.equal(normalizeSourceNewlines(root, ['app.js', 'docs/old.json', 'infra/binary.json'], new Set(['app.js'])), 0);
    for (const [name, value] of files) assert.deepEqual(readFileSync(join(root, name)), value);
  } finally { removeFixture(root); }
});
test('M8-N03: reject source paths outside the supplied workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-newlines-'));
  try { assert.throws(() => normalizeSourceNewlines(root, ['../outside.ts'], new Set()), /escaped workspace/); }
  finally { removeFixture(root); }
});
