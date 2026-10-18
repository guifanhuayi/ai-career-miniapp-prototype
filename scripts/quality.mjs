import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run this check with pnpm quality');
execFileSync(process.execPath, ['scripts/bootstrap.mjs'], {
  cwd: root,
  stdio: 'pipe',
});
const hash = (value) => createHash('sha256').update(value).digest('hex');
const codeFingerprint = () => {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(
      (path) =>
        path &&
        !path.startsWith('docs/') &&
        !path.includes('/docs/') &&
        !path.endsWith('.md'),
    )
    .sort();
  return hash(
    files
      .map((path) => `${path}\0${hash(readFileSync(resolve(root, path)))}`)
      .join('\n'),
  );
};
const startedAt = new Date().toISOString();
const phase =
  process.argv.find((value) => /^--phase=m[2-8]$/.test(value))?.slice(8) ??
  'm3';
const batch = `${phase}-${startedAt.replace(/[-:.]/g, '')}`;
const directory = resolve(root, 'docs/development/evidence', batch);
mkdirSync(directory, { recursive: true });
const report = {
  batch,
  startedAt,
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  codeFingerprint: codeFingerprint(),
  node: process.versions.node,
  packageManager: JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  ).packageManager,
  lockHash: hash(readFileSync(resolve(root, 'pnpm-lock.yaml'))),
  fixtureHash: hash(
    readFileSync(
      resolve(root, 'packages/domain/fixtures/prototype-content.json'),
    ),
  ),
  steps: [],
  deferredTests: existsSync(
    resolve(root, 'infra/runtime/media/boundary-2101.json'),
  )
    ? []
    : [
        'M3-017: real2099/2100/2100.1/2101 media fixtures unavailable; generation execution not approved',
      ],
  result: 'running',
};
const steps = [
  ['frozen-install', ['install', '--frozen-lockfile']],
  ['prisma-client', ['db:generate']],
  ['prototype', ['check:prototype']],
  ['protection-tests', ['test:protection']],
  ['static-check', ['exec', 'biome', 'check', '.', '--diagnostic-level=warn']],
  ['typecheck', ['typecheck']],
  ['test-script-types', ['exec', 'tsc', '--noEmit']],
  ['admin-lint', ['--filter', '@career/admin', 'lint']],
  [
    'admin-components',
    ['--filter', '@career/admin', 'exec', 'antd', 'lint', 'src/pages/Career'],
  ],
  ['domain-tests', ['test:domain']],
  ['api-tests', ['test:api']],
  ['contract-drift', ['contracts:check']],
  ['api-build', ['api:build']],
  ['wechat-build', ['miniapp:build']],
  ['h5-build', ['h5:build']],
  ['admin-build', ['admin:build']],
  ['browser-tests', ['test:e2e']],
  ...(phase === 'm8'
    ? [
        [
          'performance-baseline',
          [
            'exec',
            'tsx',
            '--tsconfig',
            'apps/api/tsconfig.json',
            'scripts/benchmark-local.ts',
          ],
        ],
      ]
    : []),
];
for (const [name, args] of steps) {
  const stepStart = Date.now();
  console.log(`CHECK ${name}`);
  const result = await new Promise((resolveResult) => {
    const child = spawn(process.execPath, [pnpm, ...args], {
      cwd: root,
      env: { ...process.env, CAREER_EVIDENCE_DIR: directory },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', () =>
      resolveResult({ code: 1, output: 'Unable to start check process' }),
    );
    child.on('close', (code) => resolveResult({ code: code ?? 1, output }));
  });
  // Only test/development output, never the local environment or HTTP bodies.
  const clean = stripVTControlCharacters(result.output);
  writeFileSync(resolve(directory, `${name}.txt`), clean);
  report.steps.push({
    name,
    exitCode: result.code,
    durationMs: Date.now() - stepStart,
    evidence: `${name}.txt`,
  });
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${name}`);
  if (result.code !== 0) {
    console.log(clean.slice(-2500));
    report.result = 'failed';
    process.exitCode = 1;
    break;
  }
}
if (report.result === 'running')
  report.result =
    report.codeFingerprint === codeFingerprint()
      ? report.deferredTests.length
        ? 'passed-with-deferred-tests'
        : 'passed'
      : 'source-changed-during-check';
if (!['passed', 'passed-with-deferred-tests'].includes(report.result))
  process.exitCode = 1;
report.finishedAt = new Date().toISOString();
writeFileSync(
  resolve(directory, 'results.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(`Evidence: docs/development/evidence/${batch}/results.json`);
