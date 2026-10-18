import {
  chinaDay,
  clientEvents,
  learningEvents,
  serverEvents,
} from './event-policy';

export const DAY_MS = 86_400_000;
export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dayStart(day: string) {
  if (!validDay(day)) throw new RangeError('Invalid calendar day');
  return new Date(`${day}T00:00:00+08:00`);
}
export function addDays(day: string, offset: number) {
  return chinaDay(new Date(dayStart(day).getTime() + offset * DAY_MS));
}
export interface EventFact {
  id: string;
  visitorId: string;
  name: string;
  source: string;
  effectiveAt: Date;
  flowId: string | null;
  taskId: string | null;
  courseId: string | null;
  position?: number | null;
  marked?: boolean | null;
  clockAnomaly?: boolean;
  positionAnomaly?: boolean;
}
export const jobSteps = [
  'jd_submit',
  'analysis_completed',
  'task_selected',
  'assessment_submitted',
  'recommendation_viewed',
  'course_open_attempted',
] as const;
export const taskSteps = [
  'task_selected',
  'assessment_submitted',
  'recommendation_viewed',
  'course_open_attempted',
] as const;
export interface StageMembers {
  name: string;
  chainKeys: string[];
  flowKeys: string[];
  visitorIds: string[];
}
export function canonicalFacts(input: readonly EventFact[]) {
  const unique = new Map<string, EventFact>();
  for (const e of input) {
    const authoritative = serverEvents.has(e.name)
      ? e.source === 'server'
      : clientEvents.has(e.name) && e.source === 'client';
    if (
      authoritative &&
      Number.isFinite(e.effectiveAt.getTime()) &&
      !unique.has(e.id)
    )
      unique.set(e.id, e);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}
// Memberships are persisted internally; public reports expose counts, never visitor/flow identifiers.
export function funnelMembers(
  input: readonly EventFact[],
  startDay: string,
  endDay: string,
  kind: 'job' | 'task',
): StageMembers[] {
  const begin = dayStart(startDay).getTime(),
    end = dayStart(addDays(endDay, 1)).getTime();
  if (begin >= end) throw new RangeError('Invalid date range');
  const steps = kind === 'job' ? jobSteps : taskSteps;
  const state = steps.map((name) => ({
    name,
    chains: new Set<string>(),
    flows: new Set<string>(),
    visitors: new Set<string>(),
  }));
  const groups = new Map<string, EventFact[]>();
  for (const e of canonicalFacts(input)) {
    if (!e.flowId) continue;
    const key = JSON.stringify([e.visitorId, e.flowId]);
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  for (const [flowKey, events] of groups) {
    const anchors = new Map<string, EventFact>();
    for (const e of events) {
      if (e.name !== steps[0] || (kind === 'task' && !e.taskId)) continue;
      const key = kind === 'job' ? 'flow' : (e.taskId as string);
      if (!anchors.has(key)) anchors.set(key, e);
    }
    for (const anchor of anchors.values()) {
      const start = anchor.effectiveAt.getTime();
      if (start < begin || start >= end) continue;
      const deadline = start + DAY_MS;
      const tasks =
        kind === 'task'
          ? [anchor.taskId]
          : [
              ...new Set(
                events
                  .filter(
                    (e) =>
                      e.name === 'task_selected' &&
                      e.taskId &&
                      e.effectiveAt.getTime() >= start &&
                      e.effectiveAt.getTime() <= deadline,
                  )
                  .map((e) => e.taskId),
              ),
            ];
      if (tasks.length === 0) tasks.push(null);
      for (const taskId of tasks) {
        const chainKey = JSON.stringify([
          anchor.visitorId,
          anchor.flowId,
          taskId,
        ]);
        let cursor = start;
        for (const [index, name] of steps.entries()) {
          const hit =
            index === 0
              ? anchor
              : events.find(
                  (e) =>
                    e.name === name &&
                    ((kind === 'job' && index === 1) ||
                      (taskId !== null && e.taskId === taskId)) &&
                    e.effectiveAt.getTime() >= cursor &&
                    e.effectiveAt.getTime() <= deadline,
                );
          if (!hit) break;
          cursor = hit.effectiveAt.getTime();
          const stage = state[index];
          if (!stage) break;
          stage.chains.add(chainKey);
          stage.flows.add(flowKey);
          stage.visitors.add(anchor.visitorId);
        }
      }
    }
  }
  return state.map((s) => ({
    name: s.name,
    chainKeys: [...s.chains].sort(),
    flowKeys: [...s.flows].sort(),
    visitorIds: [...s.visitors].sort(),
  }));
}
export function mergeStages(days: readonly StageMembers[][]): StageMembers[] {
  const result = new Map<
    string,
    { chains: Set<string>; flows: Set<string>; visitors: Set<string> }
  >();
  for (const stages of days)
    for (const s of stages) {
      const r = result.get(s.name) ?? {
        chains: new Set<string>(),
        flows: new Set<string>(),
        visitors: new Set<string>(),
      };
      for (const id of s.chainKeys) r.chains.add(id);
      for (const id of s.flowKeys) r.flows.add(id);
      for (const id of s.visitorIds) r.visitors.add(id);
      result.set(s.name, r);
    }
  return [...result].map(([name, r]) => ({
    name,
    chainKeys: [...r.chains].sort(),
    flowKeys: [...r.flows].sort(),
    visitorIds: [...r.visitors].sort(),
  }));
}
export function activeMembers(input: readonly EventFact[], day: string) {
  return [
    ...new Set(
      canonicalFacts(input)
        .filter(
          (e) => learningEvents.has(e.name) && chinaDay(e.effectiveAt) === day,
        )
        .map((e) => e.visitorId),
    ),
  ].sort();
}
export function percentile(
  samples: readonly number[],
  p: number,
): number | null {
  if (!(p > 0 && p <= 1)) throw new RangeError('Invalid percentile');
  const values = samples
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  return values[Math.ceil(values.length * p) - 1] ?? null;
}
export function retention(
  cohort: readonly { visitorId: string; firstDay: string }[],
  activity: readonly { visitorId: string; day: string }[],
  day: string,
  today: string,
) {
  if (!validDay(today) || !validDay(day))
    throw new RangeError('Invalid cohort day');
  const ids = new Set(
    cohort.filter((c) => c.firstDay === day).map((c) => c.visitorId),
  );
  const point = (offset: number) => {
    const observationDay = addDays(day, offset);
    const pending = observationDay > today;
    const returned = new Set(
      activity
        .filter((a) => a.day === observationDay && ids.has(a.visitorId))
        .map((a) => a.visitorId),
    ).size;
    return {
      observationDay,
      pending,
      ongoing: observationDay === today,
      returned: pending ? null : returned,
      rate: pending || ids.size === 0 ? null : returned / ids.size,
    };
  };
  return { day, cohortSize: ids.size, d1: point(1), d7: point(7) };
}
