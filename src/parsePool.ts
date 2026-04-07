/**
 * Worker pool for parsing .slp files off the main thread.
 *
 * Uses a pool of worker_threads to parse replays concurrently without
 * blocking the Electron main process. Pool size defaults to
 * Math.max(1, cpuCount - 2) to leave headroom for the UI and Dolphin.
 *
 * Workers are spawned lazily and reused across jobs via message passing.
 */

import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import type { GameResult } from "./pipeline";

/** Timeout per parse job — prevents corrupt replays from hanging indefinitely */
const JOB_TIMEOUT_MS = 60_000;

interface ParseJob {
  filePath: string;
  gameNumber: number;
  resolve: (result: GameResult) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

interface WorkerOutput {
  success: boolean;
  filePath: string;
  result?: GameResult;
  error?: string;
}

// In dev, tsx/cjs lets us run the .ts source directly.
// In production (packaged exe), the compiled .js lives next to us — no tsx needed.
import fs from "fs";
const WORKER_TS = path.resolve(__dirname, "parseWorker.ts");
const WORKER_JS = path.resolve(__dirname, "parseWorker.js");
const IS_DEV = fs.existsSync(WORKER_TS);
const WORKER_PATH = IS_DEV ? WORKER_TS : WORKER_JS;

export class ParsePool {
  private poolSize: number;
  private workers: Worker[] = [];
  private idle: Set<Worker> = new Set();
  private activeJobs: Map<Worker, ParseJob> = new Map();
  private queue: ParseJob[] = [];

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? Math.max(1, os.cpus().length - 2);
  }

  /**
   * Parse a single .slp file in a worker thread.
   * Returns the same result as processGame() but without blocking main.
   */
  parse(filePath: string, gameNumber: number = 1): Promise<GameResult> {
    return new Promise((resolve, reject) => {
      const job: ParseJob = {
        filePath,
        gameNumber,
        resolve: (result) => { clearTimeout(job.timer); resolve(result); },
        reject: (err) => { clearTimeout(job.timer); reject(err); },
      };
      job.timer = setTimeout(() => {
        // Remove from queue if still pending
        const queueIdx = this.queue.indexOf(job);
        if (queueIdx >= 0) {
          this.queue.splice(queueIdx, 1);
        }
        // Kill the worker if actively running this job
        for (const [worker, activeJob] of this.activeJobs) {
          if (activeJob === job) {
            this.activeJobs.delete(worker);
            worker.terminate();
            break;
          }
        }
        reject(new Error(`Parse timeout after ${JOB_TIMEOUT_MS / 1000}s: ${filePath}`));
      }, JOB_TIMEOUT_MS);
      this.queue.push(job);
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
  ): Promise<GameResult[]> {
    const results: GameResult[] = new Array(filePaths.length);
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
    this.idle.clear();
    this.activeJobs.clear();
    for (const job of this.queue) {
      job.reject(new Error("Pool terminated"));
    }
    this.queue.forEach((job) => clearTimeout(job.timer));
    this.queue = [];
  }

  private spawnWorker(): Worker {
    const worker = new Worker(WORKER_PATH, {
      ...(IS_DEV ? { execArgv: ["--require", "tsx/cjs"] } : {}),
    });

    worker.on("message", (output: WorkerOutput) => {
      const job = this.activeJobs.get(worker);
      this.activeJobs.delete(worker);
      this.idle.add(worker);

      if (job) {
        if (output.success && output.result) {
          job.resolve(output.result);
        } else {
          job.reject(new Error(output.error ?? "Unknown worker error"));
        }
      }

      this.dispatch();
    });

    worker.on("error", (err: unknown) => {
      const job = this.activeJobs.get(worker);
      this.activeJobs.delete(worker);

      // Remove dead worker from pool and spawn a replacement on next dispatch
      const idx = this.workers.indexOf(worker);
      if (idx >= 0) this.workers.splice(idx, 1);
      this.idle.delete(worker);

      if (job) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }

      this.dispatch();
    });

    worker.on("exit", (code: number) => {
      const job = this.activeJobs.get(worker);
      this.activeJobs.delete(worker);

      // Remove exited worker from pool
      const idx = this.workers.indexOf(worker);
      if (idx >= 0) this.workers.splice(idx, 1);
      this.idle.delete(worker);

      if (job) {
        job.reject(new Error(`Worker exited unexpectedly with code ${code}`));
      }

      this.dispatch();
    });

    this.workers.push(worker);
    this.idle.add(worker);
    return worker;
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      // Find an idle worker or spawn one if under limit
      let worker: Worker | undefined;

      for (const w of this.idle) {
        worker = w;
        break;
      }

      if (!worker && this.workers.length < this.poolSize) {
        worker = this.spawnWorker();
      }

      if (!worker) return; // All workers busy, jobs stay queued

      const job = this.queue.shift()!;
      this.idle.delete(worker);
      this.activeJobs.set(worker, job);

      worker.postMessage({ filePath: job.filePath, gameNumber: job.gameNumber });
    }
  }
}

// Singleton pool used by the app
export const parsePool = new ParsePool();
