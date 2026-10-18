import assert from 'node:assert/strict';
import test from 'node:test';
import { localConfig } from '../../apps/api/src/config';
import {
  analyzeJd,
  characterCount,
  chinaDay,
  eligibleDuration,
  formatDuration,
  scoreLevel,
  validateEvidence,
  validJd,
} from '../../packages/domain/src';

for (const [value, expected] of [
  [180, true],
  [181, true],
  [480, true],
  [1680, true],
  [2099, true],
  [2100, true],
  [2100.1, false],
  [2101, false],
  [0, false],
  [-1, false],
  [NaN, false],
  [Infinity, false],
  [null, false],
  [undefined, false],
  ['2100', false],
] as const) {
  test(`COURSE-006 / MT-083: duration ${String(value)} => ${expected}`, () =>
    assert.equal(eligibleDuration(value), expected));
}
for (const [score, level] of [
  [0, 'beginner'],
  [1, 'beginner'],
  [2, 'intermediate'],
  [3, 'intermediate'],
  [4, 'advanced'],
] as const) {
  test(`QUIZ-003 / MT-073: ${score}/4 => ${level}`, () =>
    assert.equal(scoreLevel(score), level));
}
test('QUIZ-003: out of range or fractional score rejected', () => {
  for (const value of [-1, 5, 2.5, NaN]) assert.throws(() => scoreLevel(value));
});
test('JD-001/002 MT-019/021: Unicode code-point boundary frozen at8000', () => {
  assert.equal(characterCount('中😀\nA'), 4);
  assert.equal(validJd('😀'.repeat(8000)), true);
  assert.equal(validJd('😀'.repeat(8001)), false);
  for (const value of ['', ' \n\t ', null, undefined, 8])
    assert.equal(validJd(value), false);
});
test('ANA-001 MT-041/042: evidence is an exact UTF-16 slice of confirmed input', () => {
  const text = '😀岗位要求：使用Excel分析运营数据。制作PPT汇报。';
  const ids = ['ppt', 'data', 'media', 'prompt'];
  const result = analyzeJd(text, ids);
  assert.deepEqual(
    result.map((e) => e.sceneId),
    ['ppt', 'data'],
  );
  assert.equal(validateEvidence(text, result, ids), true);
  assert.equal(
    validateEvidence(text, [{ ...result[0]!, quote: '虚构证据' }], ids),
    false,
  );
  assert.equal(
    validateEvidence(text, [{ ...result[0]!, sceneId: 'unknown' }], ids),
    false,
  );
});
test('ANA-007 MT-044/045: negation and script responsibility do not imply video generation', () => {
  const result = analyzeJd(
    '无需PPT经验，不要求编程。撰写短视频脚本，不负责视频生成。',
    ['ppt', 'coding', 'prompt', 'media'],
  );
  assert.deepEqual(
    result.map((e) => e.sceneId),
    ['prompt'],
  );
});
test('ANA-002 MT-043: no match provides clearly typed extension without fake quote', () => {
  assert.deepEqual(analyzeJd('负责线下接待与文件归档。', ['prompt', 'ppt']), [
    { sceneId: 'prompt', kind: 'extension', quote: '', start: 0, end: 0 },
  ]);
});
test('M2-013 ANA-007: negation immediately before a generation verb is not a requirement', () => {
  assert.deepEqual(
    analyzeJd('本岗不生成视频，只负责线下接待。', ['media']),
    [],
  );
});
test('MT-092: duration display never supplies fixed chapter lengths', () => {
  assert.equal(formatDuration(480), '8:00');
  assert.equal(formatDuration(2100), '35:00');
  assert.equal(formatDuration(NaN), '待核对');
});
test('LOCAL-ADMIN-001 / MT-145: public no-login configuration fails closed', () => {
  for (const host of ['0.0.0.0', '192.168.1.2', 'example.org'])
    assert.throws(() => localConfig({ API_HOST: host }));
  for (const environment of ['production', 'staging', ''])
    assert.throws(() => localConfig({ APP_ENV: environment }));
  assert.equal(localConfig({}).host, '127.0.0.1');
  assert.throws(() => localConfig({ API_PORT: '0' }));
});
test('ANA-DASH-002: day boundaries use Shanghai calendar', () => {
  assert.equal(chinaDay(new Date('2026-10-17T15:59:59Z')), '2026-10-17');
  assert.equal(chinaDay(new Date('2026-10-17T16:00:00Z')), '2026-10-18');
});
