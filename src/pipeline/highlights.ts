import { isKenCombo } from "../kenCombo";
import type { ConversionType, FramesType } from "@slippi/slippi-js/node";

import type { GameSummary } from "./types.js";
import { moveIdToName, getMoveName, frameToTimestamp, stageBounds } from "./helpers.js";
import {
  hasSequence,
  hasAdjacentSequence,
  MOVE_FAIR,
  MOVE_DAIR,
  MOVE_UAIR,
  MOVE_SHINE,
  MOVE_USMASH,
  MOVE_UTHROW,
  MOVE_DTHROW,
  MOVE_FSMASH,
  MOVE_DSMASH,
  MOVE_PUMMEL,
  MOVE_DOWN_B,
  MOVE_UP_B,
  MOVE_SIDE_B,
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

function getStockNumber(attackerIndex: number, frame: number, frames: FramesType): number | null {
  const fd = frames[frame];
  if (!fd) return null;
  const post = fd.players[attackerIndex]?.post;
  if (!post) return null;
  const stocks = post.stocksRemaining;
  if (stocks == null) return null;
  // Stock number = 5 - remaining (standard 4 stock game)
  return 5 - stocks;
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

    // Zero-to-death: starts at 0% and kills
    if (conv.startPercent === 0 && conv.didKill) {
      highlights.push({
        type: "zero-to-death",
        label: "Zero-to-Death",
        description: `${names.join(" → ")} (${damage}% total)`,
        character: playerCharacter,
        victim: opponentCharacter,
        startFrame: conv.startFrame,
        timestamp: frameToTimestamp(conv.startFrame),
        damage,
        startPercent: 0,
        didKill: true,
        moves: names,
        stockNumber: stock,
      });
    }

    // Spike kill: last move is a meteor/spike (dair) and it killed while opponent offstage
    if (conv.didKill && conv.moves.length > 0) {
      const lastMove = conv.moves[conv.moves.length - 1]!;
      if (lastMove.moveId === MOVE_DAIR) {
        const endFrame = conv.endFrame;
        if (endFrame != null) {
          const fd = frames[endFrame];
          const victimPost = fd?.players[opponentIndex]?.post;
          if (victimPost) {
            const posX = victimPost.positionX ?? 0;
            const posY = victimPost.positionY ?? 0;
            const bounds = stageBounds(stageId);
            if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
              highlights.push({
                type: "spike-kill",
                label: "Spike Kill",
                description: `dair spike at ${Math.round(conv.startPercent)}%`,
                character: playerCharacter,
                victim: opponentCharacter,
                startFrame: conv.startFrame,
                timestamp: frameToTimestamp(conv.startFrame),
                damage,
                startPercent: Math.round(conv.startPercent),
                didKill: true,
                moves: names,
                stockNumber: stock,
              });
            }
          }
        }
      }
    }

    // High-damage conversion: 80%+ in a single opening (non-kill, since kill conversions
    // are usually highlighted by other detectors)
    if (damage >= 80 && !conv.didKill) {
      highlights.push({
        type: "high-damage",
        label: "Huge Conversion",
        description: `${damage}% in one opening (${names.join(" → ")})`,
        character: playerCharacter,
        victim: opponentCharacter,
        startFrame: conv.startFrame,
        timestamp: frameToTimestamp(conv.startFrame),
        damage,
        startPercent: Math.round(conv.startPercent),
        didKill: false,
        moves: names,
        stockNumber: stock,
      });
    }
  }

  return highlights;
}

// ── Game-result highlights ──────────────────────────────────────────

function detectGameResultHighlights(gameSummary: GameSummary, playerIndex: number): GameHighlight[] {
  const highlights: GameHighlight[] = [];
  const player = gameSummary.players[playerIndex]!;
  const opponentIdx = playerIndex === 0 ? 1 : 0;
  const opponent = gameSummary.players[opponentIdx]!;
  const isWinner = gameSummary.result.winner === player.tag;

  if (!isWinner) return highlights;

  const playerStocksLeft = gameSummary.result.finalStocks[playerIndex];
  const opponentStocksLeft = gameSummary.result.finalStocks[opponentIdx];

  // 4-stock (opponent took zero stocks)
  if (playerStocksLeft === 4 && opponentStocksLeft === 0) {
    highlights.push({
      type: "four-stock",
      label: "4-Stock",
      description: `Perfect game against ${opponent.tag} (${opponent.character})`,
      character: player.character,
      victim: opponent.character,
      startFrame: 0,
      timestamp: "0:00",
      damage: 0,
      startPercent: 0,
      didKill: false,
      moves: [],
      stockNumber: null,
    });
  }

  // JV4: won with 4 stocks and 0%
  if (playerStocksLeft === 4 && opponentStocksLeft === 0 && gameSummary.result.finalPercents[playerIndex] === 0) {
    // Upgrade from 4-stock to JV5 (melee players call a 4-stock with 0% a "JV5")
    const existing = highlights.find((h) => h.type === "four-stock");
    if (existing) {
      existing.type = "jv5";
      existing.label = "JV5";
      existing.description = `Perfect game — 4-stock with 0% taken against ${opponent.tag}`;
    }
  }

  // JV4: won with 3 stocks and 0% (took 1 stock but at 0%)
  if (playerStocksLeft === 3 && opponentStocksLeft === 0 && gameSummary.result.finalPercents[playerIndex] === 0) {
    highlights.push({
      type: "jv4",
      label: "JV4",
      description: `3 stocks, 0% taken against ${opponent.tag} (${opponent.character})`,
      character: player.character,
      victim: opponent.character,
      startFrame: 0,
      timestamp: "0:00",
      damage: 0,
      startPercent: 0,
      didKill: false,
      moves: [],
      stockNumber: null,
    });
  }

  // Comeback: won after being down to last stock while opponent had 3+
  // We detect this by checking if the player ever went down to 1 stock while opponent had 3+
  // Since we don't have per-frame stock tracking here, we approximate:
  // if player lost 3 stocks and still won, it was likely a comeback
  if (playerStocksLeft === 1 && opponentStocksLeft === 0) {
    highlights.push({
      type: "comeback",
      label: "Comeback",
      description: `Won on last stock against ${opponent.tag} (${opponent.character})`,
      character: player.character,
      victim: opponent.character,
      startFrame: 0,
      timestamp: "0:00",
      damage: 0,
      startPercent: 0,
      didKill: false,
      moves: [],
      stockNumber: null,
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
): GameHighlight[] {
  const highlights: GameHighlight[] = [];

  const myConversions = conversions.filter((c) => c.playerIndex === opponentIndex && c.moves.length > 0);

  for (const conv of myConversions) {
    const { moves } = conv;
    const damage = convDamage(conv);
    const names = moveNames(moves);
    const stock = getStockNumber(playerIndex, conv.startFrame, frames);

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
        // Tipper fsmash kill at low percent
        if (
          moves.length > 0 &&
          moves[moves.length - 1]!.moveId === MOVE_FSMASH &&
          conv.didKill &&
          conv.startPercent < 80
        ) {
          highlights.push({
            ...base,
            type: "tipper-fsmash",
            label: "Tipper F-Smash",
            description: `fsmash kill at ${Math.round(conv.startPercent)}% — early tipper`,
          });
        }
        break;
      }

      case "Fox": {
        // Shine spike kill (offstage shine kill)
        if (conv.didKill && moves.length > 0) {
          const lastMove = moves[moves.length - 1]!;
          if (lastMove.moveId === MOVE_SHINE) {
            const endFrame = conv.endFrame;
            if (endFrame != null) {
              const fd = frames[endFrame];
              const victimPost = fd?.players[opponentIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  highlights.push({
                    ...base,
                    type: "shine-spike",
                    label: "Shine Spike",
                    description: `offstage shine kill at ${Math.round(conv.startPercent)}%`,
                  });
                }
              }
            }
          }
        }
        // Waveshine → upsmash kill
        if (hasSequence(moves, MOVE_SHINE, MOVE_USMASH) && conv.didKill) {
          highlights.push({
            ...base,
            type: "waveshine-upsmash",
            label: "Shine → Up Smash",
            description: `shine → upsmash kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        // Upthrow → upair kill
        if (hasSequence(moves, MOVE_UTHROW, MOVE_UAIR) && conv.didKill) {
          highlights.push({
            ...base,
            type: "upthrow-upair",
            label: "Upthrow Upair",
            description: `upthrow → upair kill at ${Math.round(conv.startPercent)}%`,
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
        // Shine spike (same as Fox)
        if (conv.didKill && moves.length > 0) {
          const lastMove = moves[moves.length - 1]!;
          if (lastMove.moveId === MOVE_SHINE) {
            const endFrame = conv.endFrame;
            if (endFrame != null) {
              const fd = frames[endFrame];
              const victimPost = fd?.players[opponentIndex]?.post;
              if (victimPost) {
                const bounds = stageBounds(stageId);
                if (Math.abs(victimPost.positionX ?? 0) > bounds.x || (victimPost.positionY ?? 0) < bounds.yMin) {
                  highlights.push({
                    ...base,
                    type: "shine-spike",
                    label: "Shine Spike",
                    description: `offstage shine kill at ${Math.round(conv.startPercent)}%`,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "Falcon": {
        // Stomp → knee
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_FAIR) && conv.didKill) {
          highlights.push({
            ...base,
            type: "stomp-knee",
            label: "Stomp Knee",
            description: `stomp → knee kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        // Sacred combo: upair → knee kill
        if (hasSequence(moves, MOVE_UAIR, MOVE_FAIR) && conv.didKill) {
          highlights.push({
            ...base,
            type: "sacred-combo",
            label: "Sacred Combo",
            description: `upair → knee kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Puff":
      case "Jigglypuff": {
        // Rest kill
        if (conv.didKill && moves.some((m) => m.moveId === MOVE_DOWN_B)) {
          // Find what move preceded rest
          const restIdx = moves.findIndex((m) => m.moveId === MOVE_DOWN_B);
          const setup = restIdx > 0 ? moveName(moves[restIdx - 1]!.moveId) : "raw";
          highlights.push({
            ...base,
            type: "rest-kill",
            label: "Rest Kill",
            description: `${setup} → rest kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Sheik": {
        // Tech chase kill: starts from throw, 3+ moves, kills
        if (
          conv.didKill &&
          moves.length >= 3 &&
          (moves[0]!.moveId === MOVE_DTHROW || moves[0]!.moveId === MOVE_UTHROW)
        ) {
          highlights.push({
            ...base,
            type: "tech-chase-kill",
            label: "Tech Chase Kill",
            description: `downthrow tech chase → kill (${moves.length} hits, ${damage}%)`,
          });
        }
        // Fair gimp: fair kill at low percent while offstage
        if (
          conv.didKill &&
          moves.length > 0 &&
          moves[moves.length - 1]!.moveId === MOVE_FAIR &&
          conv.startPercent < 60
        ) {
          highlights.push({
            ...base,
            type: "fair-gimp",
            label: "Fair Gimp",
            description: `fair edgeguard kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Peach": {
        // Downsmash kill at low percent
        if (
          conv.didKill &&
          moves.length > 0 &&
          moves[moves.length - 1]!.moveId === MOVE_DSMASH &&
          conv.startPercent < 50
        ) {
          highlights.push({
            ...base,
            type: "dsmash-kill",
            label: "Downsmash Kill",
            description: `downsmash kill at ${Math.round(conv.startPercent)}% — devastating`,
          });
        }
        break;
      }

      case "ICs":
      case "Ice Climbers": {
        // Wobble: 8+ pummels in a conversion
        if (countMoveId(moves, MOVE_PUMMEL) >= 8) {
          const label = conv.didKill ? "Wobble Kill" : "Wobble";
          highlights.push({
            ...base,
            type: "wobble",
            label,
            description: `${countMoveId(moves, MOVE_PUMMEL)} pummels${conv.didKill ? " → kill" : ""} at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Ganon":
      case "Ganondorf": {
        // Stomp kill (dair)
        if (conv.didKill && moves.length > 0 && moves[moves.length - 1]!.moveId === MOVE_DAIR) {
          highlights.push({
            ...base,
            type: "ganon-stomp",
            label: "Ganon Stomp",
            description: `stomp kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        // Side-B kill (Gerudo Dragon / Flame Choke)
        if (conv.didKill && moves.some((m) => m.moveId === MOVE_SIDE_B)) {
          highlights.push({
            ...base,
            type: "ganoncide",
            label: "Ganoncide",
            description: `side-B kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Luigi": {
        // Shoryuken kill (up-B kill)
        if (conv.didKill && moves.length > 0 && moves[moves.length - 1]!.moveId === MOVE_UP_B) {
          highlights.push({
            ...base,
            type: "shoryuken",
            label: "Shoryuken",
            description: `up-B kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "Ness": {
        // Back throw kill
        if (
          conv.didKill &&
          moves.some((m) => m.moveId === 53) // MOVE_BTHROW
        ) {
          highlights.push({
            ...base,
            type: "backthrow-kill",
            label: "Back Throw Kill",
            description: `back throw kill at ${Math.round(conv.startPercent)}%`,
          });
        }
        break;
      }

      case "G&W":
      case "Mr. Game & Watch": {
        // Judgement kill (side-B / hammer)
        if (conv.didKill && moves.some((m) => m.moveId === MOVE_SIDE_B)) {
          highlights.push({
            ...base,
            type: "judgement-kill",
            label: "Judgement Kill",
            description: `hammer kill at ${Math.round(conv.startPercent)}%`,
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
): GameHighlight[] {
  // targetPlayerIndex = array position in gameSummary.players[] (always 0 or 1)
  // targetPortIndex / opponentPortIndex = actual slippi-js player indices (0-3, based on controller port)
  // When port indices are not provided, fall back to array indices (works for standard ports 1/2)
  const arrayOpponentIndex = targetPlayerIndex === 0 ? 1 : 0;
  const portTarget = targetPortIndex ?? targetPlayerIndex;
  const portOpponent = opponentPortIndex ?? arrayOpponentIndex;
  const player = gameSummary.players[targetPlayerIndex]!;
  const opponent = gameSummary.players[arrayOpponentIndex]!;

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
  highlights.push(...detectGameResultHighlights(gameSummary, targetPlayerIndex));

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
    ),
  );

  // Deduplicate: if a conversion produced both a universal and character-specific highlight,
  // prefer the character-specific one (more descriptive). Dedupe by startFrame + type prefix.
  const seen = new Map<number, Set<string>>();
  const deduped: GameHighlight[] = [];

  // Sort so character-specific come first (they have more specific types)
  const charSpecific = highlights.filter(
    (h) =>
      h.type !== "zero-to-death" &&
      h.type !== "spike-kill" &&
      h.type !== "high-damage" &&
      h.type !== "four-stock" &&
      h.type !== "jv5" &&
      h.type !== "jv4" &&
      h.type !== "comeback",
  );
  const universal = highlights.filter(
    (h) =>
      h.type === "zero-to-death" ||
      h.type === "spike-kill" ||
      h.type === "high-damage" ||
      h.type === "four-stock" ||
      h.type === "jv5" ||
      h.type === "jv4" ||
      h.type === "comeback",
  );

  // Character-specific always included
  for (const h of charSpecific) {
    const frameSet = seen.get(h.startFrame) ?? new Set();
    frameSet.add(h.type);
    seen.set(h.startFrame, frameSet);
    deduped.push(h);
  }

  // Universal included only if no character-specific highlight at same frame
  for (const h of universal) {
    const frameSet = seen.get(h.startFrame);
    // Game result highlights (startFrame=0) are always included
    if (h.startFrame === 0 || !frameSet || frameSet.size === 0) {
      deduped.push(h);
    }
    // Exception: zero-to-death is always notable even if there's a character-specific highlight
    else if (h.type === "zero-to-death") {
      deduped.push(h);
    }
    // Skip spike-kill / high-damage if we already have a character-specific highlight for this conversion
  }

  // Sort by timestamp (frame order)
  deduped.sort((a, b) => a.startFrame - b.startFrame);

  return deduped;
}
