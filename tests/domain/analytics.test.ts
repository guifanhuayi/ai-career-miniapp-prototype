import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeMembers,
  addDays,
  canonicalFacts,
  chinaDay,
  DAY_MS,
  dayStart,
  type EventFact,
  funnelMembers,
  jobSteps,
  mergeStages,
  percentile,
  retention,
  serverEvents,
  validDay,
} from '../../packages/domain/src';

let serial = 0;
const event = (
  name: string,
  at: string,
  taskId: string | null = 'task-a',
  flowId = 'flow-a',
  visitorId = 'visitor-a',
): EventFact => ({
  id: `event-${++serial}`,
  visitorId,
  name,
  source: serverEvents.has(name) ? 'server' : 'client',
  effectiveAt: new Date(at),
  taskId,
  flowId,
  courseId: null,
});
const start = '2026-10-17T15:59:50Z';
function chain(taskId = 'task-a', flowId = 'flow-a', visitor = 'visitor-a') {
  return jobSteps.map((name, i) =>
    event(
      name,
      new Date(Date.parse(start) + i * 4000).toISOString(),
      i < 2 ? null : taskId,
      flowId,
      visitor,
    ),
  );
}
test('M7-U01 MT132: strict leap calendar and Shanghai midnight/day arithmetic', () => {
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2026-02-29'), false);
  assert.equal(validDay('2026-10-32'), false);
  assert.equal(chinaDay(new Date('2026-10-17T16:00:00Z')), '2026-10-18');
  assert.equal(
    dayStart('2026-10-18').toISOString(),
    '2026-10-17T16:00:00.000Z',
  );
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('M7-U02 MT134: crossed midnight completed chain belongs to entry day, not final day', () => {
  const facts = chain();
  const before = funnelMembers(facts, '2026-10-17', '2026-10-17', 'job');
  assert.ok(before.every((s) => s.chainKeys.length === 1));
  assert.ok(
    funnelMembers(facts, '2026-10-18', '2026-10-18', 'job').every(
      (s) => s.chainKeys.length === 0,
    ),
  );
});
test('M7-U03 MT134: different task/flow and wrong order cannot form a complete chain', () => {
  for (const invalid of ['task', 'flow', 'order']) {
    const facts = chain();
    const end = facts[5]!;
    if (invalid === 'task') end.taskId = 'task-b';
    if (invalid === 'flow') end.flowId = 'flow-b';
    if (invalid === 'order') end.effectiveAt = new Date(start);
    assert.equal(
      funnelMembers(facts, '2026-10-17', '2026-10-18', 'job')[5]?.chainKeys
        .length,
      0,
    );
  }
});
test('M7-U04 MT134: exact24h accepted, one millisecond later not accepted', () => {
  const facts = chain();
  facts[5]!.effectiveAt = new Date(Date.parse(start) + DAY_MS);
  assert.equal(
    funnelMembers(facts, '2026-10-17', '2026-10-17', 'job')[5]?.chainKeys
      .length,
    1,
  );
  facts[5]!.effectiveAt = new Date(Date.parse(start) + DAY_MS + 1);
  assert.equal(
    funnelMembers(facts, '2026-10-17', '2026-10-17', 'job')[5]?.chainKeys
      .length,
    0,
  );
});
test('M7-U05 MT131/134: two tasks fork one flow, unique visitor once; duplicate event IDs and arbitrary source ignored', () => {
  const facts = [...chain(), ...chain('task-b')];
  const stages = funnelMembers(
    [...facts, facts[0]!],
    '2026-10-17',
    '2026-10-18',
    'job',
  );
  assert.ok(
    stages.every(
      (s) =>
        s.chainKeys.length === 2 &&
        s.flowKeys.length === 1 &&
        s.visitorIds.length === 1,
    ),
  );
  const forged = { ...event('assessment_submitted', start), source: 'client' };
  assert.equal(canonicalFacts([forged]).length, 0);
  assert.equal(canonicalFacts([facts[0]!, facts[0]!]).length, 1);
});
test('M7-U06 MT134/135: pending job remains denominator, task entry works without JD, exposure is not learning DAU', () => {
  const pending = chain().slice(0, 2);
  assert.equal(
    funnelMembers(pending, '2026-10-17', '2026-10-18', 'job')[0]?.chainKeys
      .length,
    1,
  );
  assert.equal(
    funnelMembers(pending, '2026-10-17', '2026-10-18', 'job')[2]?.chainKeys
      .length,
    0,
  );
  const tasks = chain().slice(2);
  assert.ok(
    funnelMembers(tasks, '2026-10-17', '2026-10-18', 'task').every(
      (s) => s.chainKeys.length === 1,
    ),
  );
  assert.equal(
    activeMembers(
      [event('page_view', start), event('recommendation_viewed', start)],
      '2026-10-17',
    ).length,
    0,
  );
  assert.equal(
    activeMembers(
      [event('task_selected', start), event('assessment_started', start)],
      '2026-10-17',
    ).length,
    1,
  );
});
test('M7-U07 MT135: merge day memberships by union, do not sum daily unique visitors', () => {
  const a = funnelMembers(chain(), '2026-10-17', '2026-10-18', 'job');
  const b = funnelMembers(
    chain('task-a', 'flow-b'),
    '2026-10-17',
    '2026-10-18',
    'job',
  );
  const merged = mergeStages([a, b]);
  assert.equal(merged[0]?.visitorIds.length, 1);
  assert.equal(merged[0]?.chainKeys.length, 2);
  assert.equal(merged[0]?.flowKeys.length, 2);
});
test('M7-U08 MT136: D1/D7 exact calendar, duplicate visits once, future observation null not churn', () => {
  const cohort = [
    { visitorId: 'a', firstDay: '2026-10-10' },
    { visitorId: 'b', firstDay: '2026-10-10' },
  ];
  const activity = [
    { visitorId: 'a', day: '2026-10-11' },
    { visitorId: 'a', day: '2026-10-11' },
    { visitorId: 'b', day: '2026-10-17' },
  ];
  const result = retention(cohort, activity, '2026-10-10', '2026-10-18');
  assert.equal(result.d1.rate, 0.5);
  assert.equal(result.d7.rate, 0.5);
  assert.equal(result.d1.returned, 1);
  const future = retention(cohort, activity, '2026-10-10', '2026-10-12');
  assert.equal(future.d7.pending, true);
  assert.equal(future.d7.rate, null);
  assert.equal(future.d7.returned, null);
  assert.equal(retention([], [], '2026-10-18', '2026-10-18').d1.rate, null);
});
test('M7-U09 MT129: nearest-rank percentiles use raw samples, unknown/empty never zero or averaged percentiles', () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([1, 2, 3, 100], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 100], 0.95), 100);
  assert.equal(percentile([Number.NaN, -1, 4], 0.95), 4);
});
