/**
 * Worker pool for parsing .slp files off the main thread.
 *
 * Uses a pool of worker_threads to parse replays concurrently without
 * blocking the Electron main process. Pool size defaults to
 * Math.max(1, cpuCount - 2) to leave headroom for the UI and Dolphin.
 */

import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import type { GameResult } from "./pipeline";

interface ParseJob {
  filePath: string;
  gameNumber: number;
  resolve: (result: GameResult & { startAt: string | null }) => void;
  reject: (error: Error) => void;
}

interface WorkerOutput {
  success: boolean;
  filePath: string;
  result?: GameResult & { startAt: string | null };
  error?: string;
}

const WORKER_PATH = path.resolve(__dirname, "parseWorker.ts");

export class ParsePool {
  private poolSize: number;
  private workers: Worker[] = [];
  private busy: Set<Worker> = new Set();
  private queue: ParseJob[] = [];

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? Math.max(1, os.cpus().length - 2);
  }

  /**
   * Parse a single .slp file in a worker thread.
   * Returns the same result as processGame() but without blocking main.
   */
  parse(filePath: string, gameNumber: number = 1): Promise<GameResult & { startAt: string | null }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ filePath, gameNumber, resolve, reject });
      this.dispatch();
    });
  }

  /**
   * Parse multiple files, returning results in order.
   * Fires a callback on each completion for progress tracking.
   */
  async parseMany(
    filePaths: string[],
    onProgress?: (completed: number, total: number, filePath: string) => void,
  ): Promise<(GameResult & { startAt: string | null })[]> {
    const results: (GameResult & { startAt: string | null })[] = new Array(filePaths.length);
    let completed = 0;

    await Promise.all(
      filePaths.map(async (fp, i) => {
        const result = await this.parse(fp, i + 1);
        results[i] = result;
        completed++;
        onProgress?.(completed, filePaths.length, fp);
      }),
    );

    return results;
  }

  /** Shut down all workers */
  terminate(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
    this.busy.clear();
    // Reject remaining jobs
    for (const job of this.queue) {
      job.reject(new Error("Pool terminated"));
    }
    this.queue = [];
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;

    // Find or create an available worker
    let worker = this.workers.find((w) => !this.busy.has(w));

    if (!worker && this.workers.length < this.poolSize) {
      // Spawn a new worker — use tsx to handle TypeScript
      worker = new Worker(WORKER_PATH, {
        // Dummy workerData; overridden per-job via a fresh worker
        workerData: {},
        execArgv: ["--require", "tsx/cjs"],
      });
      this.workers.push(worker);
    }

    if (!worker) return; // All workers busy, job stays queued

    const job = this.queue.shift()!;
    this.busy.add(worker);

    // For worker_threads, we need to create a fresh worker per job
    // since workerData is set at construction time.
    // Remove the reusable approach — spawn per job, terminate on done.
    this.busy.delete(worker);
    const idx = this.workers.indexOf(worker);
    if (idx >= 0) this.workers.splice(idx, 1);
    worker.terminate();

    const jobWorker = new Worker(WORKER_PATH, {
      workerData: { filePath: job.filePath, gameNumber: job.gameNumber },
      execArgv: ["--require", "tsx/cjs"],
    });

    this.workers.push(jobWorker);
    this.busy.add(jobWorker);

    jobWorker.on("message", (output: WorkerOutput) => {
      this.busy.delete(jobWorker);
      const wIdx = this.workers.indexOf(jobWorker);
      if (wIdx >= 0) this.workers.splice(wIdx, 1);
      jobWorker.terminate();

      if (output.success && output.result) {
        job.resolve(output.result);
      } else {
        job.reject(new Error(output.error ?? "Unknown worker error"));
      }

      this.dispatch(); // Process next job
    });

    jobWorker.on("error", (err: unknown) => {
      this.busy.delete(jobWorker);
      const wIdx = this.workers.indexOf(jobWorker);
      if (wIdx >= 0) this.workers.splice(wIdx, 1);
      job.reject(err instanceof Error ? err : new Error(String(err)));
      this.dispatch();
    });
  }
}

// Singleton pool used by the app
export const parsePool = new ParsePool();
