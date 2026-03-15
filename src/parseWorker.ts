/**
 * Worker thread for CPU-intensive slippi-js parsing.
 *
 * Runs processGame() off the main thread so the Electron UI stays responsive
 * during bulk imports. Communicates via worker_threads message passing.
 */

import { parentPort, workerData } from "worker_threads";
import { processGame } from "./pipeline";

interface WorkerInput {
  filePath: string;
  gameNumber: number;
}

interface WorkerOutput {
  success: boolean;
  filePath: string;
  result?: ReturnType<typeof processGame>;
  error?: string;
}

// If running as a worker thread (not imported as a module)
if (parentPort) {
  const input = workerData as WorkerInput;

  try {
    const result = processGame(input.filePath, input.gameNumber);
    const output: WorkerOutput = {
      success: true,
      filePath: input.filePath,
      result,
    };
    parentPort.postMessage(output);
  } catch (err) {
    const output: WorkerOutput = {
      success: false,
      filePath: input.filePath,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort.postMessage(output);
  }
}
