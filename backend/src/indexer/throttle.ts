export class ApiQueue {
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (err: unknown) => void;
  }> = [];
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(requestsPerSecond: number) {
    this.intervalMs = Math.max(100, Math.round(1000 / Math.max(1, requestsPerSecond)));
  }

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject });
      this.start();
    });
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const item = this.queue.shift();
      if (item) {
        item.fn().then(item.resolve).catch(item.reject);
      }
      if (this.queue.length === 0) {
        this.stop();
      }
    }, this.intervalMs);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.stop();
    this.queue.length = 0;
  }
}
