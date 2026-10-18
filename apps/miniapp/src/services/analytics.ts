import Taro from '@tarojs/taro';
import { type ApiBody, ApiError } from '../../../../packages/contracts/client';
import { EventQueue } from '../../../../packages/domain/src/event-queue';
import { getCredential, guestApi } from './api';

declare const BROWSER_DEMO: boolean;
const isBrowserDemo = typeof BROWSER_DEMO !== 'undefined' && BROWSER_DEMO;

type ClientEvent = ApiBody<'collectEvents'>['events'][number];
let queue: EventQueue<ClientEvent> | undefined;
let owner = '';
let timer: ReturnType<typeof setInterval> | undefined;
const progressAt = new Map<string, number>();
let initializing: Promise<void> | undefined;
async function initialize() {
  if (isBrowserDemo) return;
  if (initializing) return initializing;
  initializing = (async () => {
    const credential = await getCredential();
    if (owner === credential && queue) return;
    owner = credential;
    const identity = owner;
    const key = `career.events.v1.${identity.slice(-16)}`;
    queue = new EventQueue({
      read: () => {
        const value: unknown = Taro.getStorageSync(key);
        return Array.isArray(value) ? value : [];
      },
      write: (items) => Taro.setStorageSync(key, items),
      now: Date.now,
      send: async (events) => {
        // Refuse to deliver a previous visitor's queue under a newly created credential.
        if ((await getCredential()) !== identity) throw new ApiError(401, {});
        await guestApi('collectEvents', { body: { events } });
      },
      permanent: (e) =>
        e instanceof ApiError && [400, 401, 404, 409, 422].includes(e.status),
    });
    if (!timer)
      timer = setInterval(() => {
        void queue?.flush();
      }, 2000);
  })();
  try {
    await initializing;
  } finally {
    initializing = undefined;
  }
}
export function track(
  name: ClientEvent['name'],
  context: Partial<Omit<ClientEvent, 'name'>> = {},
) {
  if (isBrowserDemo) return;
  const occurredAt = context.occurredAt ?? new Date().toISOString();
  if (name === 'video_progress') {
    const key = `${context.planId}:${context.courseId}`;
    if (Date.now() - (progressAt.get(key) ?? 0) < 15000) return;
    if (progressAt.size > 200) progressAt.clear();
    progressAt.set(key, Date.now());
  }
  void initialize()
    .then(() => {
      queue?.push({
        schemaVersion: 1,
        appVersion: '0.1.0',
        eventId: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
        ...context,
        name,
        occurredAt,
      });
      void queue?.flush();
    })
    .catch(() => {
      /* Analytics cannot block learning. */
    });
}
export function resumeAnalytics() {
  if (isBrowserDemo) return;
  void initialize()
    .then(() => {
      queue?.resume();
      void queue?.flush();
    })
    .catch(() => {});
}
export function pauseAnalytics() {
  void queue?.flush();
}
export function usePageView() {
  Taro.useDidShow(() => track('page_view'));
}
