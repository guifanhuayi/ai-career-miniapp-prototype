import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('ENG-008: API Express import works in plain Node without a transitive NODE_PATH', () => {
  const environment = { ...process.env };
  delete environment.NODE_PATH;
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const { createRequire } = require('node:module');
    const { resolve } = require('node:path');
    const fromApi = createRequire(resolve('apps/api/package.json'));
    const express = fromApi('express');
    if (typeof express.json !== 'function') process.exit(2);
  `,
    ],
    {
      cwd: resolve(__dirname, '../..'),
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
