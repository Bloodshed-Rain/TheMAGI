import { isKenCombo } from "../kenCombo";
import { Frames, type ConversionType, type FramesType } from "@slippi/slippi-js/node";

import type { GameSummary } from "./types.js";
import { moveIdToName, getMoveName, frameToTimestamp } from "./helpers.js";
import { isDownwardOffstageKill, isOffstageKill, percentAtFinalHit } from "./killEvidence.js";
import {
  hasSequence,
  hasAdjacentSequence,
  conversionHasTechSituation,
  lastMoveIdOf,
  MOVE_FAIR,
  MOVE_DAIR,
  MOVE_UAIR,
  MOVE_SHINE,
  MOVE_USMASH,
  MOVE_UTHROW,
  MOVE_DTHROW,
  MOVE_FTHROW,
  MOVE_BTHROW,
  MOVE_FSMASH,
  MOVE_DSMASH,
  MOVE_PUMMEL,
  MOVE_DOWN_B,
  MOVE_UP_B,
  MOVE_SIDE_B,
  MOVE_NEUTRAL_B,
  countMoveId,
  hasTriplePattern,
} from "./signatureStats.js";

// ── Highlight type ──────────────────────────────────────────────────

export interface GameHighlight {
  /** Machine-readable type key */
  type: string;
  /** Display name shown in UI */
  label: string;
  /** Short description with context */
  description: string;
  /** Character who performed it */
  character: string;
  /** Character/tag who received it */
  victim: string;
  /** Frame number for Dolphin seek */
  startFrame: number;
  /** Human-readable timestamp */
  timestamp: string;
  /** Total damage dealt in the conversion */
  damage: number;
  /** Victim percent at start */
  startPercent: number;
  /** Whether the conversion killed */
  didKill: boolean;
  /** Move name sequence */
  moves: string[];
  /** Which stock this occurred on (attacker's stock), null if unknown */
  stockNumber: number | null;
}

/** Highlights that describe the whole game (no seek target) rather than one conversion. */
export const GAME_RESULT_HIGHLIGHT_TYPES: readonly string[] = ["four-stock", "jv5", "jv4", "comeback"];

/** Universal (any character) conversion highlights; character-specific ones win the dedupe. */
const UNIVERSAL_CONVERSION_TYPES: readonly string[] = ["zero-to-death", "spike-kill", "high-damage"];

/** Luigi's Super Jump Punch sweetspot deals 25% fresh; the sourspot deals 1%. */
const LUIGI_SHORYUKEN_MIN_DAMAGE = 8;
/** Deficit (in stocks) that has to be overturned for a win to count as a comeback. */
const COMEBACK_MIN_DEFICIT = 2;

// ── Move ID → name helper ───────────────────────────────────────────

function moveName(id: number): string {
  return moveIdToName[id] ?? getMoveName(id);
}

function moveNames(moves: ConversionType["moves"]): string[] {
  return moves.map((m) => moveName(m.moveId));
}

function convDamage(c: ConversionType): number {
  return Math.round((c.endPercent ?? c.currentPercent) - c.startPercent);
}

// ── Stock number from frame data ────────────────────────────────────

function startingStocks(playerIndex: number, frames: FramesType): number {
  const first = frames[Frames.FIRST_PLAYABLE]?.players[playerIndex]?.post?.stocksRemaining;
  return first != null && first > 0 ? first : 4;
}

function getStockNumber(attackerIndex: number, frame: number, frames: FramesType): number | null {
  const stocks = frames[frame]?.players[attackerIndex]?.post?.stocksRemaining;
  if (stocks == null) return null;
  return startingStocks(attackerIndex, frames) - stocks + 1;
}

// ── Universal highlight detectors ───────────────────────────────────

function detectUniversalHighlights(
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
  playerCharacter: string,
  opponentCharacter: string,
  frames: FramesType,
  stageId: number,
): GameHighlight[] {
  const highlights: GameHighlight[] = [];

  // Filter to conversions this player landed (opponent is victim)
  const myConversions = conversions.filter((c) => c.playerIndex === opponentIndex && c.moves.length > 0);

  for (const conv of myConversions) {
    const damage = convDamage(conv);
    const names = moveNames(conv.moves);
    const stock = getStockNumber(playerIndex, conv.startFrame, frames);
    const base = {
      character: playerCharacter,
      victim: opponentCharacter,
      startFrame: conv.startFrame,
      timestamp: frameToTimestamp(conv.startFrame),
      damage,
      startPercent: Math.round(conv.startPercent),
      didKill: conv.didKill,
      moves: names,
      stockNumber: stock,
    };

    // Zero-to-death: starts at 0% and kills
    if (conv.startPercent === 0 && conv.didKill) {
      highlights.push({
        ...base,
        type: "zero-to-death",
        label: "Zero-to-Death",
        description: `${names.join(" → ")} (${damage}% total)`,
        startPercent: 0,
      });
    }

    // Spike kill: dair was the final hit, landed with the victim offstage, and
    // the victim died off the bottom. A dair kill off the side is not a spike.
    if (isDownwardOffstageKill(conv, frames, stageId, MOVE_DAIR)) {
      highlights.push({
        ...base,
        type: "spike-kill",
        label: "Spike Kill",
        description: `dair spike with ${opponentCharacter} offstage at ${Math.round(percentAtFinalHit(conv))}%`,
      });
    }

    // High-damage conversion: 80%+ in a single opening (non-kill, since kill conversions
    // are usually highlighted by other detectors)
    if (damage >= 80 && !conv.didKill) {
      highlights.push({
        ...base,
        type: "high-damage",
        label: "Huge Conversion",
        description: `${damage}% in one opening (${names.join(" → ")})`,
      });
    }
  }

  return highlights;
}

// ── Game-result highlights ──────────────────────────────────────────

/**
 * Largest stock deficit the player faced at any point (opponent stocks minus
 * player stocks, sampled on every frame where either count changed).
 */
export function maxStockDeficit(frames: FramesType, playerIndex: number, opponentIndex: number): number {
  let worst = 0;
  let prevMine = -1;
  let prevTheirs = -1;
  const keys = Object.keys(frames)
    .map(Number)
    .filter((f) => f >= Frames.FIRST_PLAYABLE)
    .sort((a, b) => a - b);
  for (const f of keys) {
    const frame = frames[f];
    const mine = frame?.players[playerIndex]?.post?.stocksRemaining;
    const theirs = frame?.players[opponentIndex]?.post?.stocksRemaining;
    if (mine == null || theirs == null) continue;
    if (mine === prevMine && theirs === prevTheirs) continue;
    prevMine = mine;
    prevTheirs = theirs;
    if (mine <= 0) continue;
    worst = Math.max(worst, theirs - mine);
  }
  return worst;
}

function detectGameResultHighlights(
  gameSummary: GameSummary,
  playerIndex: number,
  frames: FramesType,
  portPlayer: number,
  portOpponent: number,
): GameHighlight[] {
  const highlights: GameHighlight[] = [];
  const player = gameSummary.players[playerIndex]!;
  const opponentIdx = playerIndex === 0 ? 1 : 0;
  const opponent = gameSummary.players[opponentIdx]!;
  const isWinner = gameSummary.result.winner === player.tag;

  if (!isWinner) return highlights;

  const playerStocksLeft = gameSummary.result.finalStocks[playerIndex];
  const opponentStocksLeft = gameSummary.result.finalStocks[opponentIdx];
  const playerPercent = gameSummary.result.finalPercents[playerIndex];
  const base = {
    character: player.character,
    victim: opponent.character,
    startFrame: 0,
    timestamp: "0:00",
    damage: 0,
    startPercent: 0,
    didKill: false,
    moves: [],
    stockNumber: null,
  };

  // 4-stock (opponent took zero stocks); at 0% it is a JV5
  if (playerStocksLeft === 4 && opponentStocksLeft === 0) {
    if (playerPercent === 0) {
      highlights.push({
        ...base,
        type: "jv5",
        label: "JV5",
        description: `Perfect game — 4-stock with 0% taken against ${opponent.tag}`,
      });
    } else {
      highlights.push({
        ...base,
        type: "four-stock",
        label: "4-Stock",
        description: `Perfect game against ${opponent.tag} (${opponent.character})`,
      });
    }
  }

  // JV4: won with 3 stocks and 0% (lost one stock, took no damage on the last one)
  if (playerStocksLeft === 3 && opponentStocksLeft === 0 && playerPercent === 0) {
    highlights.push({
      ...base,
      type: "jv4",
      label: "JV4",
      description: `3 stocks, 0% taken against ${opponent.tag} (${opponent.character})`,
    });
  }

  // Comeback: the player trailed by two or more stocks at some point and won.
  const deficit = maxStockDeficit(frames, portPlayer, portOpponent);
  if (deficit >= COMEBACK_MIN_DEFICIT) {
    highlights.push({
      ...base,
      type: "comeback",
      label: "Comeback",
      description: `Won after trailing by ${deficit} stocks against ${opponent.tag} (${opponent.character})`,
    });
  }

  return highlights;
}

// ── Character-specific highlight detectors ───────────────────────────

function detectCharacterHighlights(
  character: string,
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
  opponentCharacter: string,
  frames: FramesType,
  stageId: number,
  lastFrame: number,
): GameHighlight[] {
  const highlights: GameHighlight[] = [];

  const myConversions = conversions.filter((c) => c.playerIndex === opponentIndex && c.moves.length > 0);

  for (const conv of myConversions) {
    const { moves } = conv;
    const damage = convDamage(conv);
    const names = moveNames(moves);
    const stock = getStockNumber(playerIndex, conv.startFrame, frames);
    const last = lastMoveIdOf(moves);
    const lastMove = moves[moves.length - 1];
    const killPercent = Math.round(percentAtFinalHit(conv));

    const base = {
      character,
      victim: opponentCharacter,
      startFrame: conv.startFrame,
      timestamp: frameToTimestamp(conv.startFrame),
      damage,
      startPercent: Math.round(conv.startPercent),
      didKill: conv.didKill,
      moves: names,
      stockNumber: stock,
    };

    switch (character) {
      case "Marth": {
        // Ken Combo: FAIR → FAIR → DAIR, with the final DAIR taking the stock.
        if (isKenCombo(moves, conv.didKill)) {
          highlights.push({
            ...base,
            type: "ken-combo",
            label: "Ken Combo",
            description: `fair → fair → dair kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        // Early fsmash kill. Replay data does not distinguish tipper from sourspot.
        if (last === MOVE_FSMASH && conv.didKill && killPercent < 80) {
          highlights.push({
            ...base,
            type: "early-fsmash-kill",
            label: "Early F-Smash Kill",
            description: `fsmash kill with ${opponentCharacter} at ${killPercent}% (tipper not verified)`,
          });
        }
        break;
      }

      case "Fox": {
        // Shine spike: shine was the final hit, landed offstage, death not off the top
        if (last === MOVE_SHINE && isOffstageKill(conv, frames, stageId)) {
          highlights.push({
            ...base,
            type: "shine-spike",
            label: "Shine Spike",
            description: `offstage shine kill at ${killPercent}%`,
          });
        }
        // Shine immediately followed by up smash for the kill (wavedash not verified)
        if (hasAdjacentSequence(moves, MOVE_SHINE, MOVE_USMASH) && conv.didKill && last === MOVE_USMASH) {
          highlights.push({
            ...base,
            type: "waveshine-upsmash",
            label: "Shine → Up Smash",
            description: `shine → upsmash kill at ${killPercent}%`,
          });
        }
        // Up throw → up air kill
        if (hasSequence(moves, MOVE_UTHROW, MOVE_UAIR) && conv.didKill && last === MOVE_UAIR) {
          highlights.push({
            ...base,
            type: "upthrow-upair",
            label: "Upthrow Upair",
            description: `upthrow → upair kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Falco": {
        // Pillar combo: dair → shine → dair
        if (hasTriplePattern(moves, MOVE_DAIR, MOVE_SHINE, MOVE_DAIR)) {
          const label = conv.didKill ? "Pillar Kill" : "Pillar Combo";
          highlights.push({
            ...base,
            type: "pillar-combo",
            label,
            description: `dair → shine → dair (${damage}% total)${conv.didKill ? " — killed" : ""}`,
          });
        }
        if (last === MOVE_SHINE && isOffstageKill(conv, frames, stageId)) {
          highlights.push({
            ...base,
            type: "shine-spike",
            label: "Shine Spike",
            description: `offstage shine kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Falcon": {
        // Stomp immediately followed by the killing knee
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_FAIR) && conv.didKill && last === MOVE_FAIR) {
          highlights.push({
            ...base,
            type: "stomp-knee",
            label: "Stomp Knee",
            description: `stomp → knee kill at ${killPercent}%`,
          });
        }
        // Up air → knee kill
        if (hasAdjacentSequence(moves, MOVE_UAIR, MOVE_FAIR) && conv.didKill && last === MOVE_FAIR) {
          highlights.push({
            ...base,
            type: "upair-knee",
            label: "Up Air → Knee",
            description: `upair → knee kill at ${killPercent}%`,
          });
        }
        // Sacred Combo: Knee Smash followed by a Falcon Punch that connects
        if (hasAdjacentSequence(moves, MOVE_FAIR, MOVE_NEUTRAL_B)) {
          highlights.push({
            ...base,
            type: "sacred-combo",
            label: "Sacred Combo",
            description: `knee → Falcon Punch${conv.didKill && last === MOVE_NEUTRAL_B ? ` kill at ${killPercent}%` : ` (${damage}% total)`}`,
          });
        }
        break;
      }

      case "Puff":
      case "Jigglypuff": {
        // Rest kill: rest was the final hit and took the stock
        if (conv.didKill && last === MOVE_DOWN_B) {
          const restIdx = moves.length - 1;
          const setup = restIdx > 0 ? moveName(moves[restIdx - 1]!.moveId) : "raw";
          highlights.push({
            ...base,
            type: "rest-kill",
            label: "Rest Kill",
            description: `${setup} → rest kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Sheik": {
        // Tech chase kill: opened with a down/forward throw, the victim hit a
        // down/tech state inside the conversion, 3+ hits, and it killed
        const opener = moves[0]!.moveId;
        if (
          conv.didKill &&
          moves.length >= 3 &&
          (opener === MOVE_DTHROW || opener === MOVE_FTHROW) &&
          conversionHasTechSituation(conv, frames, lastFrame)
        ) {
          highlights.push({
            ...base,
            type: "tech-chase-kill",
            label: "Tech Chase Kill",
            description: `${moveName(opener)} tech chase → kill (${moves.length} hits, ${damage}%)`,
          });
        }
        // Fair gimp: fair finished the stock with the victim offstage at a low percent
        if (conv.didKill && last === MOVE_FAIR && killPercent < 60 && isOffstageKill(conv, frames, stageId)) {
          highlights.push({
            ...base,
            type: "fair-gimp",
            label: "Fair Gimp",
            description: `offstage fair kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Peach": {
        // Downsmash kill at low percent
        if (conv.didKill && last === MOVE_DSMASH && killPercent < 50) {
          highlights.push({
            ...base,
            type: "dsmash-kill",
            label: "Downsmash Kill",
            description: `downsmash kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "ICs":
      case "Ice Climbers": {
        // Extended grab: 8+ pummel records in one conversion
        const pummels = countMoveId(moves, MOVE_PUMMEL);
        if (pummels >= 8) {
          const label = conv.didKill ? "Wobble Kill" : "Wobble";
          highlights.push({
            ...base,
            type: "wobble",
            label,
            description: `${pummels} pummels${conv.didKill ? " → kill" : ""} from ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Ganon":
      case "Ganondorf": {
        // Stomp kill (dair)
        if (conv.didKill && last === MOVE_DAIR) {
          highlights.push({
            ...base,
            type: "ganon-stomp",
            label: "Ganon Stomp",
            description: `stomp kill at ${killPercent}%`,
          });
        }
        // Gerudo Dragon (side-B) kill
        if (conv.didKill && last === MOVE_SIDE_B) {
          highlights.push({
            ...base,
            type: "gerudo-kill",
            label: "Gerudo Dragon Kill",
            description: `side-B kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Luigi": {
        // Super Jump Punch sweetspot kill (the sourspot deals 1% and cannot be mistaken for it)
        if (conv.didKill && last === MOVE_UP_B && (lastMove?.damage ?? 0) >= LUIGI_SHORYUKEN_MIN_DAMAGE) {
          highlights.push({
            ...base,
            type: "shoryuken",
            label: "Shoryuken",
            description: `up-B sweetspot kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "Ness": {
        // Back throw kill
        if (conv.didKill && last === MOVE_BTHROW) {
          highlights.push({
            ...base,
            type: "backthrow-kill",
            label: "Back Throw Kill",
            description: `back throw kill at ${killPercent}%`,
          });
        }
        break;
      }

      case "G&W":
      case "Mr. Game & Watch": {
        // Judgement kill (side-B hammer was the final hit)
        if (conv.didKill && last === MOVE_SIDE_B) {
          highlights.push({
            ...base,
            type: "judgement-kill",
            label: "Judgement Kill",
            description: `hammer kill at ${killPercent}%`,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return highlights;
}

// ── Main entry point ────────────────────────────────────────────────

export function detectHighlights(
  gameSummary: GameSummary,
  conversions: ConversionType[],
  frames: FramesType,
  stageId: number,
  targetPlayerIndex: number,
  targetPortIndex?: number,
  opponentPortIndex?: number,
  lastFrame?: number,
): GameHighlight[] {
  // targetPlayerIndex = array position in gameSummary.players[] (always 0 or 1)
  // targetPortIndex / opponentPortIndex = actual slippi-js player indices (0-3, based on controller port)
  // When port indices are not provided, fall back to array indices (works for standard ports 1/2)
  const arrayOpponentIndex = targetPlayerIndex === 0 ? 1 : 0;
  const portTarget = targetPortIndex ?? targetPlayerIndex;
  const portOpponent = opponentPortIndex ?? arrayOpponentIndex;
  const player = gameSummary.players[targetPlayerIndex]!;
  const opponent = gameSummary.players[arrayOpponentIndex]!;
  const last =
    lastFrame ??
    Object.keys(frames)
      .map(Number)
      .reduce((max, f) => (f > max ? f : max), Frames.FIRST_PLAYABLE);

  const highlights: GameHighlight[] = [];

  // Universal highlights (any character)
  highlights.push(
    ...detectUniversalHighlights(
      conversions,
      portTarget,
      portOpponent,
      player.character,
      opponent.character,
      frames,
      stageId,
    ),
  );

  // Game result highlights (4-stock, JV4/JV5, comeback)
  highlights.push(...detectGameResultHighlights(gameSummary, targetPlayerIndex, frames, portTarget, portOpponent));

  // Character-specific highlights
  highlights.push(
    ...detectCharacterHighlights(
      player.character,
      conversions,
      portTarget,
      portOpponent,
      opponent.character,
      frames,
      stageId,
      last,
    ),
  );

  // Deduplicate: if a conversion produced both a universal and character-specific highlight,
  // prefer the character-specific one (more descriptive). Dedupe by startFrame + type prefix.
  const isGameResult = (t: string): boolean => GAME_RESULT_HIGHLIGHT_TYPES.includes(t);
  const isUniversal = (t: string): boolean => UNIVERSAL_CONVERSION_TYPES.includes(t) || isGameResult(t);
  const charSpecific = highlights.filter((h) => !isUniversal(h.type));
  const universal = highlights.filter((h) => isUniversal(h.type));

  const seen = new Set<number>();
  const deduped: GameHighlight[] = [];

  // Character-specific always included
  for (const h of charSpecific) {
    seen.add(h.startFrame);
    deduped.push(h);
  }

  // Universal included only if no character-specific highlight at same frame;
  // game-result highlights and zero-to-deaths are always notable.
  for (const h of universal) {
    if (isGameResult(h.type) || h.type === "zero-to-death" || !seen.has(h.startFrame)) {
      deduped.push(h);
    }
  }

  // Sort by timestamp (frame order)
  deduped.sort((a, b) => a.startFrame - b.startFrame);

  return deduped;
}
