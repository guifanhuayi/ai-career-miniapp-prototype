import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EventQueue,
  type QueuedEvent,
} from '../../packages/domain/src/event-queue';

test('M7-Q01 MT133: bounded persisted queue expires at24h, batches50, preserves additions during flight', async () => {
  let now = Date.parse('2026-10-18T08:00:00Z');
  let stored: QueuedEvent[] = [];
  const batches: QueuedEvent[][] = [];
  let release: (() => void) | undefined;
  const q = new EventQueue<QueuedEvent>({
    now: () => now,
    read: () => stored,
    write: (items) => {
      stored = [...items];
    },
    send: async (items) => {
      batches.push(items);
      await new Promise<void>((r) => {
        release = r;
      });
    },
  });
  for (let i = 0; i < 220; i++)
    q.push({
      eventId: `id-${i}`,
      occurredAt: new Date(now).toISOString(),
      name: 'page_view',
    });
  assert.equal(q.size, 200);
  assert.equal(stored[0]?.eventId, 'id-20');
  const pending = q.flush();
  const repeated = q.flush();
  q.push({
    eventId: 'during-flight',
    occurredAt: new Date(now).toISOString(),
    name: 'page_view',
  });
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.length, 50);
  release?.();
  await Promise.all([pending, repeated]);
  assert.ok(stored.some((e) => e.eventId === 'during-flight'));
  now += 86_400_000;
  await q.flush();
  assert.equal(q.size, 0);
});
test('M7-Q02 MT133: lost responses retry identical IDs, backoff and five-attempt ceiling, storage failures isolated', async () => {
  let now = Date.now(),
    calls = 0;
  const ids: string[] = [];
  const q = new EventQueue<QueuedEvent>({
    now: () => now,
    read: () => {
      throw new Error('storage');
    },
    write: () => {
      throw new Error('storage');
    },
    send: async (items) => {
      calls++;
      ids.push(items[0]!.eventId);
      throw new Error('429');
    },
  });
  q.push({
    eventId: 'retry-stable',
    occurredAt: new Date(now).toISOString(),
    name: 'page_view',
  });
  for (let i = 0; i < 7; i++) {
    await q.flush();
    await q.flush();
    now += 60_000;
  }
  assert.equal(calls, 5);
  assert.equal(new Set(ids).size, 1);
  q.resume();
  await q.flush();
  assert.equal(calls, 6);
});
test('M7-Q03 MT133: invalid event isolated without dropping valid events in same atomic batch', async () => {
  const accepted: string[] = [];
  const q = new EventQueue<QueuedEvent>({
    now: Date.now,
    read: () => [],
    write: () => {},
    permanent: (e) => e === 'invalid',
    send: async (items) => {
      if (items.some((e) => e.eventId === 'bad')) throw 'invalid';
      accepted.push(...items.map((e) => e.eventId));
    },
  });
  for (const eventId of ['good', 'bad', 'also-good'])
    q.push({
      eventId,
      occurredAt: new Date().toISOString(),
      name: 'page_view',
    });
  await q.flush();
  assert.deepEqual(accepted, ['good', 'also-good']);
  assert.equal(q.size, 0);
});
