import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMQueue } from "../src/llmQueue";
afterEach(() => vi.useRealTimers());
describe("AI queue cancellation", () => {
  it("does not start a rate-limited request after the queue is cleared", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const queue = new LLMQueue(1500);
    await queue.enqueue(async () => "first");
    const call = vi.fn(async () => "second");
    const pending = queue.enqueue(call);
    const failure = expect(pending).rejects.toThrow("Queue cleared");
    queue.clear();
    await failure;
    await vi.advanceTimersByTimeAsync(2000);
    expect(call).not.toHaveBeenCalled();
    expect(queue.isProcessing).toBe(false);
  });
  it("allows the current API call to finish while rejecting requests that have not started", async () => {
    let finish!: (value: string) => void;
    const queue = new LLMQueue(0);
    const active = queue.enqueue(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const call = vi.fn(async () => "queued");
    const pending = queue.enqueue(call);
    const failure = expect(pending).rejects.toThrow("Queue cleared");
    queue.clear();
    await failure;
    finish("complete");
    expect(await active).toBe("complete");
    expect(call).not.toHaveBeenCalled();
  });
  it("accepts new work after canceling a request in the delay window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const queue = new LLMQueue(1500);
    await queue.enqueue(async () => "first");
    const pending = queue.enqueue(async () => "canceled");
    const failure = expect(pending).rejects.toThrow("Queue cleared");
    queue.clear();
    await failure;
    const next = queue.enqueue(async () => "new session");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await next).toBe("new session");
  });
});
