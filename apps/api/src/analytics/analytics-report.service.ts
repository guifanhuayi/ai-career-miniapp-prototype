import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ApiRequestMetric, BehaviorEvent, Prisma } from '@prisma/client';
import {
  activeMembers,
  addDays,
  canonicalFacts,
  DAY_MS,
  dayStart,
  funnelMembers,
  mergeStages,
  percentile,
  retention,
  type StageMembers,
} from '../../../../packages/domain/src/analytics';
import { chinaDay } from '../../../../packages/domain/src/event-policy';
import { Database } from '../database';
import { jsonSnapshot } from '../idempotency';
import type { AnalyticsReport, ReportQuery } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

interface Snapshot {
  eventSealed: boolean;
  requestSealed: boolean;
  active: string[];
  job: StageMembers[];
  task: StageMembers[];
  counts: Record<string, number>;
  distribution: Record<string, Record<string, number>>;
  clock: number;
  position: number;
  requests: {
    count: number;
    failures: number;
    retries: number;
    errors: Record<string, number>;
  };
}
const count = (target: Record<string, number>, key: string, n = 1) => {
  target[key] = (target[key] ?? 0) + n;
};
const counts = (value: Record<string, number>) =>
  Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));
function snapshot(
  events: BehaviorEvent[],
  requests: ApiRequestMetric[],
  day: string,
  jobFlows: Set<string>,
): Snapshot {
  const facts = canonicalFacts(events);
  const rawById = new Map(events.map((e) => [e.id, e]));
  const current = facts.filter((e) => chinaDay(e.effectiveAt) === day);
  const result: Snapshot = {
    eventSealed: false,
    requestSealed: false,
    active: activeMembers(events, day),
    job: funnelMembers(events, day, day, 'job'),
    task: funnelMembers(
      events.filter((e) => !e.flowId || !jobFlows.has(e.flowId)),
      day,
      day,
      'task',
    ),
    counts: {},
    distribution: {},
    clock: 0,
    position: 0,
    requests: { count: 0, failures: 0, retries: 0, errors: {} },
  };
  for (const e of current) {
    count(result.counts, e.name);
    if (
      e.name === 'course_mark_changed' &&
      e.marked !== null &&
      e.marked !== undefined
    )
      count(
        result.counts,
        e.marked ? 'course_mark_set' : 'course_mark_removed',
      );
    result.clock += Number(e.clockAnomaly);
    result.position += Number(e.positionAnomaly);
    const raw = rawById.get(e.id);
    for (const [kind, id] of [
      ['scene', raw?.sceneId],
      ['task', e.taskId],
      ['course', e.courseId],
    ]) {
      if (!id) continue;
      const key = `${kind}:${id}`;
      const bucket = result.distribution[key] ?? {};
      result.distribution[key] = bucket;
      count(bucket, e.name);
    }
  }
  for (const r of requests.filter((r) => chinaDay(r.createdAt) === day)) {
    result.requests.count++;
    result.requests.failures += Number(r.status >= 400);
    result.requests.retries += r.retryCount;
    if (r.errorCode || r.status >= 400)
      count(result.requests.errors, r.errorCode ?? `HTTP_${r.status}`);
  }
  return result;
}

@Injectable()
export class AnalyticsReportService implements OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  private async data(tx: Prisma.TransactionClient, environment?: string) {
    const filter = environment ? { environment } : {};
    const [events, requests, archives, jobs] = await Promise.all([
      tx.behaviorEvent.findMany({
        where: filter,
        orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
      }),
      tx.apiRequestMetric.findMany({ where: filter }),
      tx.dailyAggregate.findMany({ where: filter }),
      tx.analysisJob.findMany({
        where: environment ? { visitor: { environment } } : {},
        select: { flowId: true },
      }),
    ]);
    // Old server facts derive their scene from the durable task rather than client claims.
    const tasks = await tx.task.findMany({
      select: { id: true, sceneId: true },
    });
    const scenes = new Map(tasks.map((t) => [t.id, t.sceneId]));
    for (const e of events)
      e.sceneId ??= e.taskId ? (scenes.get(e.taskId) ?? null) : null;
    return {
      events,
      requests,
      archives,
      jobFlows: new Set(jobs.map((j) => j.flowId)),
    };
  }

  private build(
    data: Awaited<ReturnType<AnalyticsReportService['data']>>,
    environment: string,
    day: string,
  ) {
    const old = data.archives.find(
      (a) => a.environment === environment && a.day === day,
    )?.metrics as unknown as Snapshot | undefined;
    const begin = dayStart(day).getTime(),
      end = begin + 2 * DAY_MS;
    const current = snapshot(
      data.events.filter(
        (e) =>
          e.environment === environment &&
          e.effectiveAt.getTime() >= begin &&
          e.effectiveAt.getTime() <= end,
      ),
      data.requests.filter((r) => r.environment === environment),
      day,
      data.jobFlows,
    );
    if (old?.eventSealed) {
      current.eventSealed = true;
      for (const key of [
        'active',
        'job',
        'task',
        'counts',
        'distribution',
        'clock',
        'position',
      ] as const)
        Object.assign(current, { [key]: old[key] });
    }
    if (old?.requestSealed) {
      current.requestSealed = true;
      current.requests = old.requests;
    }
    return current;
  }

  async report(query: ReportQuery, now = new Date()): Promise<AnalyticsReport> {
    const { startDay, endDay, environment } = this.analytics.range(query, now);
    return this.db.$transaction(
      async (tx) => {
        const data = await this.data(tx, environment);
        const days: string[] = [];
        for (
          let day = addDays(startDay, -6);
          day <= addDays(endDay, 7);
          day = addDays(day, 1)
        )
          days.push(day);
        const byDay = new Map(
          days.map((day) => [day, this.build(data, environment, day)]),
        );
        const getDay = (day: string) => {
          const value = byDay.get(day);
          if (!value) throw new Error('Missing analytics day');
          return value;
        };
        const selected = days.filter((day) => day >= startDay && day <= endDay);
        const cohorts = await tx.visitor.findMany({
          where: {
            environment,
            firstLearningAt: {
              gte: dayStart(startDay),
              lt: dayStart(addDays(endDay, 1)),
            },
          },
          select: { id: true, firstLearningAt: true },
        });
        const activity = days.flatMap((day) =>
          getDay(day).active.map((visitorId) => ({ day, visitorId })),
        );
        const eventCounts: Record<string, number> = {},
          distribution: Record<string, Record<string, number>> = {},
          errors: Record<string, number> = {};
        let requestCount = 0,
          failures = 0,
          retries = 0,
          clockAnomalies = 0,
          positionAnomalies = 0;
        for (const day of selected) {
          const s = getDay(day);
          for (const [name, n] of Object.entries(s.counts))
            count(eventCounts, name, n);
          for (const [key, values] of Object.entries(s.distribution)) {
            const bucket = distribution[key] ?? {};
            distribution[key] = bucket;
            for (const [name, n] of Object.entries(values))
              count(bucket, name, n);
          }
          requestCount += s.requests.count;
          failures += s.requests.failures;
          retries += s.requests.retries;
          for (const [name, n] of Object.entries(s.requests.errors))
            count(errors, name, n);
          clockAnomalies += s.clock;
          positionAnomalies += s.position;
        }
        let percentileStart = new Date(
          Math.max(dayStart(startDay).getTime(), now.getTime() - 14 * DAY_MS),
        );
        const percentileEnd = new Date(
          Math.min(dayStart(addDays(endDay, 1)).getTime(), now.getTime()),
        );
        if (percentileStart > percentileEnd) percentileStart = percentileEnd;
        const samples = data.requests
          .filter(
            (r) =>
              r.createdAt >= percentileStart && r.createdAt < percentileEnd,
          )
          .map((r) => r.durationMs);
        const jobs = await tx.analysisJob.findMany({
          where: {
            visitor: { environment },
            createdAt: {
              gte: dayStart(startDay),
              lt: dayStart(addDays(endDay, 1)),
            },
          },
          select: {
            status: true,
            errorCode: true,
            result: true,
            selectedScenes: true,
          },
        });
        let succeeded = 0,
          failed = 0,
          timedOut = 0,
          noMatch = 0,
          suggestions = 0,
          reviewedSelections = 0,
          deselected = 0;
        for (const job of jobs) {
          if (job.status === 'succeeded') {
            succeeded++;
            const items =
              (job.result as { items?: { sceneId: string }[] } | null)?.items ??
              [];
            if (!items.length) noMatch++;
            suggestions += items.length;
            if (Array.isArray(job.selectedScenes)) {
              reviewedSelections += items.length;
              deselected += items.filter(
                (i) => !(job.selectedScenes as string[]).includes(i.sceneId),
              ).length;
            }
          }
          failed += Number(job.status === 'failed');
          timedOut += Number(
            job.errorCode === 'ANALYSIS_TIMEOUT' || job.status === 'timed_out',
          );
        }
        const funnel = (kind: 'job' | 'task') =>
          mergeStages(selected.map((day) => getDay(day)[kind])).map((s) => ({
            name: s.name,
            chains: s.chainKeys.length,
            flows: s.flowKeys.length,
            visitors: s.visitorIds.length,
          }));
        return {
          environment,
          startDay,
          endDay,
          timezone: 'Asia/Shanghai',
          generatedAt: now.toISOString(),
          activeVisitors: new Set(selected.flatMap((day) => getDay(day).active))
            .size,
          activity: selected.map((day) => ({
            day,
            dau: getDay(day).active.length,
            wau: new Set(
              activity
                .filter((a) => a.day >= addDays(day, -6) && a.day <= day)
                .map((a) => a.visitorId),
            ).size,
          })),
          jobFunnel: funnel('job'),
          taskFunnel: funnel('task'),
          retention: selected.map((day) =>
            retention(
              cohorts.flatMap((v) =>
                v.firstLearningAt
                  ? [
                      {
                        visitorId: v.id,
                        firstDay: chinaDay(v.firstLearningAt),
                      },
                    ]
                  : [],
              ),
              activity,
              day,
              chinaDay(now),
            ),
          ),
          events: counts(eventCounts),
          distribution: Object.entries(distribution)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, values]) => ({
              kind: key.slice(0, key.indexOf(':')),
              resourceId: key.slice(key.indexOf(':') + 1),
              events: counts(values),
            })),
          requests: {
            count: requestCount,
            failures,
            retries,
            successRate: requestCount
              ? (requestCount - failures) / requestCount
              : null,
            p50Ms: percentile(samples, 0.5),
            p95Ms: percentile(samples, 0.95),
            percentileSamples: samples.length,
            percentileStart: percentileStart.toISOString(),
            percentileEnd: percentileEnd.toISOString(),
            errors: counts(errors),
          },
          analysis: {
            count: jobs.length,
            succeeded,
            failed,
            timedOut,
            noMatch,
            suggestions,
            reviewedSelections,
            deselected,
            noMatchRate: succeeded ? noMatch / succeeded : null,
            deselectionRate: reviewedSelections
              ? deselected / reviewedSelections
              : null,
            evidenceQuality: '仅结构与原文区间校验，语义质量未人工评审',
            humanReview: '未评审',
            provider: 'local-rules / jd-rules-v1（非真实模型）',
          },
          clockAnomalies,
          positionAnomalies,
          notes: [
            '正式环境默认排除local/test/demo；匿名访客不代表自然人。',
            '漏斗按入口日、访客/flow/任务有序24小时计算；岗位与直接任务入口分开。',
            '今天及最近24小时漏斗仍在观察中；留存ongoing表示观察日尚未结束。',
            '位置是客户端报告，不代表可信观看时长；播放结束及手动看过分别统计。',
            '原始事件90天、请求14天、日聚合365天；百分位仅使用返回窗口内可用原始样本。',
          ],
        };
      },
      { timeout: 60_000 },
    );
  }

  start() {
    if (this.timer) return;
    const run = () =>
      void this.runOnce().catch(() =>
        process.stderr.write('analytics_maintenance_failed\n'),
      );
    this.timer = setInterval(run, 3600_000);
    this.timer.unref();
    run();
  }
  async runOnce(now = new Date()) {
    if (this.pending) return this.pending;
    this.pending = this.maintain(now);
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async maintain(now: Date) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM AnalyticsLock WHERE id = 1 FOR UPDATE`;
        const data = await this.data(tx);
        const eventCut = new Date(now.getTime() - 90 * DAY_MS),
          requestCut = new Date(now.getTime() - 14 * DAY_MS);
        const oldestDay = addDays(chinaDay(now), -364);
        const keys = new Map<string, { environment: string; day: string }>();
        for (const e of data.events)
          keys.set(`${e.environment}:${chinaDay(e.effectiveAt)}`, {
            environment: e.environment,
            day: chinaDay(e.effectiveAt),
          });
        for (const r of data.requests)
          keys.set(`${r.environment}:${chinaDay(r.createdAt)}`, {
            environment: r.environment,
            day: chinaDay(r.createdAt),
          });
        for (const a of data.archives) keys.set(`${a.environment}:${a.day}`, a);
        for (const { environment, day } of keys.values()) {
          if (day < oldestDay) continue;
          const s = this.build(data, environment, day);
          s.eventSealed ||= day <= chinaDay(eventCut);
          s.requestSealed ||= day <= chinaDay(requestCut);
          await tx.dailyAggregate.upsert({
            where: { day_environment: { day, environment } },
            create: { day, environment, metrics: jsonSnapshot(s) },
            update: { metrics: jsonSnapshot(s) },
          });
        }
        // Archive succeeds in the same transaction before deleting any raw observations.
        await tx.behaviorEvent.deleteMany({
          where: { receivedAt: { lt: eventCut } },
        });
        await tx.apiRequestMetric.deleteMany({
          where: { createdAt: { lt: requestCut } },
        });
        await tx.dailyAggregate.deleteMany({
          where: { day: { lt: oldestDay } },
        });
      },
      { timeout: 60_000 },
    );
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
