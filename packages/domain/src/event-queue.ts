// Platform-free queue. Storage/transport failures must never escape into the learning flow.
export interface QueuedEvent {
  eventId: string;
  occurredAt: string;
  name: string;
}
export class EventQueue<T extends QueuedEvent> {
  private items: T[] = [];
  private pending?: Promise<boolean>;
  private attempts = 0;
  private retryAt = 0;
  constructor(
    private readonly options: {
      read: () => T[];
      write: (items: T[]) => void;
      send: (items: T[]) => Promise<void>;
      now: () => number;
      permanent?: (error: unknown) => boolean;
    },
  ) {
    try {
      this.items = options.read();
    } catch {
      this.items = [];
    }
    this.prune();
  }
  private prune() {
    const now = this.options.now();
    this.items = this.items
      .filter(
        (e) =>
          e &&
          typeof e.eventId === 'string' &&
          Number.isFinite(Date.parse(e.occurredAt)) &&
          now - Date.parse(e.occurredAt) < 86_400_000 &&
          Date.parse(e.occurredAt) <= now + 86_400_000,
      )
      .slice(-200);
    try {
      this.options.write(this.items);
    } catch {
      /* Best effort only. */
    }
  }
  push(event: T) {
    if (!this.items.some((e) => e.eventId === event.eventId))
      this.items.push(event);
    this.prune();
  }
  get size() {
    return this.items.length;
  }
  // Five consecutive attempts maximum per retry cycle. A foreground/network-resume explicitly starts a new cycle.
  resume() {
    this.attempts = 0;
    this.retryAt = 0;
  }
  async flush(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.prune();
    if (
      !this.items.length ||
      this.attempts >= 5 ||
      this.options.now() < this.retryAt
    )
      return false;
    const batch = this.items.slice(0, 50);
    this.pending = (async () => {
      try {
        await this.options.send(batch);
        const ids = new Set(batch.map((e) => e.eventId));
        this.items = this.items.filter((e) => !ids.has(e.eventId));
        this.attempts = 0;
        this.retryAt = 0;
        this.prune();
        return true;
      } catch (error) {
        if (this.options.permanent?.(error)) {
          // An invalid member must not discard unrelated valid members of an atomic batch.
          const removed = new Set<string>();
          for (const event of batch) {
            try {
              await this.options.send([event]);
              removed.add(event.eventId);
            } catch (singleError) {
              if (this.options.permanent?.(singleError))
                removed.add(event.eventId);
            }
          }
          this.items = this.items.filter((e) => !removed.has(e.eventId));
          this.prune();
        }
        this.attempts++;
        this.retryAt =
          this.options.now() + Math.min(60_000, 1000 * 2 ** this.attempts);
        return false;
      }
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
}
