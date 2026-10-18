import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  auditPrototype, baselineFiles, repositoryRoot, textDigest, prototypeBaseline, themeApproval, documentationApproval,
} from '../scripts/check-prototype.mjs';
import { originalText, themedContents } from '../scripts/build-prototype-theme.mjs';

const files = baselineFiles();
const readOriginal = (path) => readFileSync(resolve(repositoryRoot, path));

test('ENG-003: eleven original files match the original or explicitly approved color/documentation baseline', () => {
  assert.equal(files.length, 11);
  assert.deepEqual(auditPrototype(files, readOriginal), []);
});

test('DOC-001: README approval is scoped, original text is archived and subsequent changes are detected', () => {
  assert.equal(documentationApproval.baseline, prototypeBaseline);
  assert.deepEqual(Object.keys(documentationApproval.approvedFiles), ['README.md']);
  const originalReadme = baselineFiles({ original: true }).find((file) => file.path === 'README.md');
  assert.equal(textDigest(readOriginal('docs/prototype-original-readme.md')), originalReadme.digest);
  const tampered = (path) => path === 'README.md' ? Buffer.from('unauthorized README change') : readOriginal(path);
  assert.deepEqual(auditPrototype(files, tampered), [{ path: 'README.md', reason: 'content-changed' }]);
});

test('THEME-001: only CSS color literals change across four authorized files; every script, text and layout rule is preserved', () => {
  assert.equal(themeApproval.baseline, prototypeBaseline);
  const contents = themedContents();
  assert.deepEqual(Object.keys(contents).sort(), ['index.html', 'overview.html', 'prototype.html', 'style.css']);
  assert.deepEqual(Object.keys(themeApproval.approvedFiles).sort(), Object.keys(contents).sort());
  const mask = (text) => text.replace(/#[\da-f]{3,8}\b/gi, '#COLOR');
  for (const [path, content] of Object.entries(contents)) {
    assert.equal(mask(content), mask(originalText(path)), path);
    assert.equal(textDigest(Buffer.from(content)), themeApproval.approvedFiles[path], path);
    assert.equal(textDigest(readOriginal(path)), textDigest(Buffer.from(content)), path);
  }
  assert.equal(readOriginal('app.js').toString('utf8').replace(/\r\n/g, '\n'), originalText('app.js'));
});

test('THEME-002: a later unauthorized color modification is still detected', () => {
  const tampered = (path) => path === 'style.css' ? Buffer.from(readOriginal(path).toString('utf8').replace('#1668dc', '#ff0000')) : readOriginal(path);
  assert.deepEqual(auditPrototype(files, tampered), [{ path: 'style.css', reason: 'content-changed' }]);
});

test('THEME-003: approved blue buttons and orange emphasis meet text contrast', () => {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel,16)/255).map((channel) => channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4);
    return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
  };
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for (const [foreground,background] of [['#ffffff','#1668dc'],['#492c00','#faad14'],['#667085','#ffffff'],['#1f2937','#ffffff']]) assert.ok(contrast(foreground,background) >= 4.5, `${foreground}/${background}`);
});

test('THEME-004: native navigation, miniapp tokens and icon generator use the same approved palette', () => {
  const tokens = readOriginal('packages/design-tokens/miniapp.less').toString('utf8');
  for (const [token, name] of Object.entries({primary:'primary',dark:'dark',paper:'background',ink:'ink',mint:'subtle',surface:'background',muted:'muted',border:'border',accent:'accent','accent-ink':'accentText'})) {
    assert.ok(tokens.includes(`@${token}: ${themeApproval.palette[name]};`), token);
  }
  assert.ok(readOriginal('apps/miniapp/src/app.config.ts').toString('utf8').includes(`navigationBarBackgroundColor: '${themeApproval.palette.background}'`));
  assert.ok(readOriginal('scripts/generate-icons.mjs').toString('utf8').includes('themeApproval.palette.primary'));
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
