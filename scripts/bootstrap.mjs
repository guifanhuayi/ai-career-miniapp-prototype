import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSourceNewlines } from './source-newlines.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.versions.node !== '24.19.0') throw new Error('Use Node.js 24.19.0');
// Preserve the prototype .gitignore. Reproducible local exclusions live in Git metadata.
const exclude = resolve(
  root,
  execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
);
const patterns = [
  'node_modules/',
  '.pnpm-store/',
  '/.template-pro/',
  '/.template-pro.tar',
  'dist/',
  'dist-h5/',
  '.cache/',
  '.umi/',
  '.umi-production/',
  'coverage/',
  'test-results/',
  'playwright-report/',
  '/infra/runtime/',
  '*.tsbuildinfo',
];
mkdirSync(resolve(exclude, '..'), { recursive: true });
let previous = '';
try {
  previous = readFileSync(exclude, 'utf8');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const missing = patterns.filter((p) => !previous.split(/\r?\n/).includes(p));
if (missing.length)
  appendFileSync(
    exclude,
    `\n# AI career local development\n${missing.join('\n')}\n`,
  );
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const protectedPaths = new Set(
  execFileSync(
    'git',
    [
      'ls-tree',
      '-rz',
      '--name-only',
      '910b4ae0704531691dbed100e62fff98cd0687a2',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean),
);
const normalized = normalizeSourceNewlines(root, tracked, protectedPaths);
console.log(
  `Formal source LF normalization: ${normalized} files; local edits preserved.`,
);
console.log(
  'Runtime and local Git exclusions ready. Original .gitignore unchanged.',
);
