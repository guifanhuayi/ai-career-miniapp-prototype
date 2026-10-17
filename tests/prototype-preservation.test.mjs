import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  auditPrototype, baselineFiles, repositoryRoot, textDigest,
} from '../scripts/check-prototype.mjs';

const files = baselineFiles();
const readOriginal = (path) => readFileSync(resolve(repositoryRoot, path));

test('ENG-003: all eleven original files remain unchanged', () => {
  assert.equal(files.length, 11);
  assert.deepEqual(auditPrototype(files, readOriginal), []);
});

test('ENG-004: a source content change is detected', () => {
  const readTampered = (path) => path === 'app.js' ? Buffer.from('changed') : readOriginal(path);
  assert.deepEqual(auditPrototype(files, readTampered), [
    { path: 'app.js', reason: 'content-changed' },
  ]);
});

test('ENG-005: deleting an original file is detected', () => {
  const readMissing = (path) => {
    if (path === 'prototype.html') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return readOriginal(path);
  };
  assert.deepEqual(auditPrototype(files, readMissing), [
    { path: 'prototype.html', reason: 'missing' },
  ]);
});

test('ENG-006: checkout line endings are tolerated, content and BOM are preserved', () => {
  assert.equal(textDigest(Buffer.from('第一行\nsecond\n')), textDigest(Buffer.from('第一行\r\nsecond\r\n')));
  assert.notEqual(textDigest(Buffer.from('first\n')), textDigest(Buffer.from('first')));
  assert.notEqual(textDigest(Buffer.from('first')), textDigest(Buffer.from('\ufefffirst')));
});

test('ENG-007: filesystem errors do not silently become preservation success', () => {
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  assert.throws(() => auditPrototype(files, () => { throw denied; }), (error) => error === denied);
});
