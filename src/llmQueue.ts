/**
 * Rate-limited queue for LLM API calls.
 *
 * Processes one request at a time with a configurable delay between calls.
 * Prevents 429 Too Many Requests errors when importing a batch of replays.
 */

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class LLMQueue {
  private queue: QueueItem<any>[] = [];
  private processing = false;
  private delayMs: number;
  private lastCallTime = 0;
  private waiting: QueueItem<any> | null = null;
  private cancelWait: (() => void) | null = null;

  /**
   * @param delayMs Minimum milliseconds between API calls. Default 1500ms
   *                (safe for 30 RPM Gemini free tier).
   */
  constructor(delayMs: number = 1500) {
    this.delayMs = delayMs;
  }

  /** Number of items waiting in the queue */
  get pending(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Enqueue an async function. Returns a promise that resolves
   * when the function actually executes (after waiting its turn).
   */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const item = this.queue.shift()!;
    this.waiting = item;

    // Enforce minimum delay between calls
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < this.delayMs) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.cancelWait = null;
          resolve();
        }, this.delayMs - elapsed);
        this.cancelWait = () => {
          clearTimeout(timer);
          this.cancelWait = null;
          resolve();
        };
      });
    }

    // clear() must also cancel the item already removed from the queue but
    // still waiting for its rate-limit delay. It has not made an API call yet.
    if (this.waiting !== item) {
      this.processing = false;
      void this.processNext();
      return;
    }
    this.waiting = null;

    try {
      this.lastCallTime = Date.now();
      const result = await item.fn();
      item.resolve(result);
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)));
    }

    this.processing = false;
    // Process next item if queue isn't empty
    this.processNext();
  }

  /** Clear all pending items (rejects them) */
  clear(): void {
    for (const item of this.queue) {
      item.reject(new Error("Queue cleared"));
    }
    this.queue = [];
    if (this.waiting) {
      this.waiting.reject(new Error("Queue cleared"));
      this.waiting = null;
      this.cancelWait?.();
    }
  }
}

// Singleton instance used by the app
export const llmQueue = new LLMQueue(1500);
