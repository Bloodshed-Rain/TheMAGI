/**
 * Worker thread for CPU-intensive slippi-js parsing.
 *
 * Runs analyzeGame() off the main thread so the Electron UI stays responsive
 * during bulk imports. Listen for messages so the worker can be reused
 * across multiple parse jobs without respawning.
 *
 * Fail-closed: never posts success-shaped fake stats. Degenerate / thrown
 * analysis is reported as status "failed" with a reason.
 */

import { parentPort } from "worker_threads";
import { analyzeGame, type AnalyzedGame } from "./pipeline";

interface WorkerInput {
  filePath: string;
  gameNumber: number;
}

interface WorkerOutput {
  success: boolean;
  filePath: string;
  result?: AnalyzedGame;
  error?: string;
  analysisStatus?: "ok" | "failed" | "unavailable";
}

if (parentPort) {
  parentPort.on("message", (input: WorkerInput) => {
    const outcome = analyzeGame(input.filePath, input.gameNumber);
    if (outcome.status === "ok") {
      const output: WorkerOutput = {
        success: true,
        filePath: input.filePath,
        result: outcome.result,
        analysisStatus: "ok",
      };
      parentPort!.postMessage(output);
    } else {
      const output: WorkerOutput = {
        success: false,
        filePath: input.filePath,
        error: outcome.reason,
        analysisStatus: outcome.status,
      };
      parentPort!.postMessage(output);
    }
  });
}
