import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
test('M2-021 ENG-001: direct dependency versions and runtime are fixed across applications', () => {
  const root = readJson('package.json');
  assert.equal(root.engines.node, '24.19.0');
  assert.equal(root.packageManager, 'pnpm@11.25.0');
  for (const path of [
    'package.json',
    'apps/api/package.json',
    'apps/miniapp/package.json',
    'apps/admin/package.json',
  ]) {
    const manifest = readJson(path);
    for (const version of Object.values({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      assert.match(
        String(version),
        /^(?:\d+\.\d+\.\d+(?:-[\w.-]+)?|workspace:\*)$/,
      );
    }
  }
  assert.ok(
    readFileSync('pnpm-lock.yaml', 'utf8').includes('lockfileVersion:'),
  );
});
test('M2-022 D01: actual official Pro template provenance and fixed design remain traceable', () => {
  const provenance = readJson('apps/admin/TEMPLATE_PROVENANCE.json');
  assert.equal(provenance.tag, 'v6.0.3');
  assert.equal(provenance.commit, 'adfd44085738ca953573a13322c1ba84aca8b9e3');
  assert.match(readFileSync('apps/admin/LICENSE', 'utf8'), /MIT License/);
  assert.match(
    readFileSync('apps/admin/config/defaultSettings.ts', 'utf8'),
    /colorPrimary: '#1677ff'/,
  );
  const config = readFileSync('apps/admin/config/config.ts', 'utf8');
  assert.equal(config.includes('analytics:'), false);
  assert.equal(config.includes('/user/login'), false);
  assert.equal('deploy' in readJson('apps/admin/package.json').scripts, false);
});
