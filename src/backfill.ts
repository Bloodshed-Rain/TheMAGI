/**
 * Backfill engine: re-parse already-imported replays so every per-game
 * derived row reflects the current detectors.
 *
 * Originally this only filled the per-instance event tables (schema
 * v10-v14: conversions / stock_deaths / habit_instances / throw_di /
 * recovery_spans / shield_blocks / whiff_events). Since FRAME_EVENTS_VERSION
 * 3 it also rewrites game_stats, character_signature_stats and highlights
 * from the same parse, because those rows depend on the same stage-bounds,
 * move-id and kill-evidence definitions and were wrong for games imported
 * by older detectors.
 *
 * Safe to re-run: each game's derived rows are deleted and re-inserted in
 * one transaction, and files are re-hashed so a moved/replaced replay at the
 * stored path is skipped instead of poisoning the wrong game row.
 */

import crypto from "crypto";
import fs from "fs";

import { findPlayerIdx } from "./pipeline";
import { parsePool } from "./parsePool";
import {
  getDb,
  getBackfillCandidates,
  deleteDerivedGameRows,
  deleteFrameEventRows,
  insertGameStats,
  insertHighlights,
  insertSignatureStats,
  type BackfillCandidate,
} from "./db";
import { persistFrameEvents } from "./importer";
import { buildInsertGameStatsParams } from "./replayAnalyzer";

const PARSE_BATCH_SIZE = 8;

export interface BackfillProgress {
  total: number;
  done: number;
  backfilled: number;
  missingFile: number;
  hashMismatch: number;
  failed: number;
}

export interface BackfillOptions {
  /** Re-process every game, replacing existing event rows. */
  force?: boolean;
  /** Cap the number of games processed this run. */
  limit?: number;
  onProgress?: (p: BackfillProgress) => void;
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

async function processCandidate(candidate: BackfillCandidate, progress: BackfillProgress): Promise<void> {
  if (!fs.existsSync(candidate.replayPath)) {
    progress.missingFile++;
    return;
  }

  const hash = await hashFile(candidate.replayPath);
  if (hash !== candidate.replayHash) {
    // A different file now lives at the stored path — do not attribute its
    // events to this game row.
    progress.hashMismatch++;
    return;
  }

  const gameResult = await parsePool.parse(candidate.replayPath, 1);
  const playerIdx = findPlayerIdx(gameResult.gameSummary, candidate.playerTag);
  const player = gameResult.gameSummary.players[playerIdx];

  const tx = getDb().transaction(() => {
    deleteDerivedGameRows(candidate.id);
    deleteFrameEventRows(candidate.id);

    insertGameStats(buildInsertGameStatsParams(candidate.id, gameResult, candidate.playerTag));
    if (player.signatureStats) {
      insertSignatureStats(candidate.id, JSON.stringify(player.signatureStats));
    }
    const highlights = gameResult.highlights[playerIdx];
    if (highlights && highlights.length > 0) {
      insertHighlights(candidate.id, highlights);
    }

    persistFrameEvents(candidate.id, gameResult.frameEvents, playerIdx);
  });
  tx();
  progress.backfilled++;
}

export async function backfillFrameEvents(options: BackfillOptions = {}): Promise<BackfillProgress> {
  const candidates = getBackfillCandidates(options.force === true, options.limit);
  const progress: BackfillProgress = {
    total: candidates.length,
    done: 0,
    backfilled: 0,
    missingFile: 0,
    hashMismatch: 0,
    failed: 0,
  };

  for (let i = 0; i < candidates.length; i += PARSE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + PARSE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (candidate) => {
        try {
          await processCandidate(candidate, progress);
        } catch (err) {
          progress.failed++;
          console.warn(
            `[backfill] game ${candidate.id} (${candidate.replayPath}): ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          progress.done++;
        }
      }),
    );
    options.onProgress?.(progress);
  }

  return progress;
}
