import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getCharacterEventProfile aggregates the v10-v14 per-instance event tables
// for one character. We point db.ts at a throwaway home directory (so getDb()
// builds the real schema + migrations in a temp DB), seed two characters'
// games plus event rows through the real insert helpers, and assert on the
// aggregation: character isolation, is_player perspective, condition splits,
// distinct-game coverage, and trivia sums.

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  const { mkdtempSync } = await import("fs");
  const { join } = await import("path");
  const home = mkdtempSync(join(actual.tmpdir(), "magi-character-events-"));
  const homedir = () => home;
  return { ...actual, homedir, default: { ...actual, homedir } };
});

describe("character analytics page wiring", () => {
  const charactersSource = fs.readFileSync(path.resolve(__dirname, "../src/renderer/pages/Characters.tsx"), "utf-8");
  const modules = [
    "IdentityCard",
    "FormStrip",
    "PunishEconomy",
    "HabitLedger",
    "RecoveryMatrix",
    "DeathReport",
    "StageCard",
    "TriviaCard",
  ];

  it("mounts every character analytics module", () => {
    for (const moduleName of modules) {
      expect(charactersSource).toContain(`./characters/${moduleName}`);
      expect(charactersSource).toContain(`<${moduleName}`);
    }
  });
});

// better-sqlite3's native addon is compiled for Electron's ABI (see CLAUDE.md),
// so instantiating it under vitest's plain Node throws NODE_MODULE_VERSION
// errors. Node's built-in sqlite covers the exact Database surface db.ts uses
// (exec / prepare / pragma / transaction / close), so the queries under test
// run against real SQLite either way.
vi.mock("better-sqlite3", async () => {
  const { DatabaseSync } = await import("node:sqlite");

  class Database {
    private db: InstanceType<typeof DatabaseSync>;

    constructor(dbPath: string) {
      this.db = new DatabaseSync(dbPath);
    }

    pragma(source: string): unknown {
      return this.db.prepare(`PRAGMA ${source}`).all();
    }

    exec(sql: string): void {
      this.db.exec(sql);
    }

    prepare(sql: string) {
      return this.db.prepare(sql);
    }

    transaction<T extends (...args: unknown[]) => unknown>(fn: T) {
      return (...args: Parameters<T>): ReturnType<T> => {
        this.db.exec("BEGIN");
        try {
          const result = fn(...args) as ReturnType<T>;
          this.db.exec("COMMIT");
          return result;
        } catch (err) {
          this.db.exec("ROLLBACK");
          throw err;
        }
      };
    }

    close(): void {
      this.db.close();
    }
  }

  return { default: Database };
});

import {
  getDb,
  closeDb,
  insertGame,
  insertGameStats,
  insertConversionEvents,
  insertStockDeaths,
  insertThrowDIRows,
  insertRecoverySpans,
  insertShieldBlocks,
  insertWhiffEvents,
  insertHabitInstances,
  getCharacterEventProfile,
  getPatternData,
  setGameEventsVersion,
  type InsertGameParams,
  type InsertGameStatsParams,
  type ConversionEventRow,
  type StockDeathRow,
  type RecoverySpanRow,
  type ShieldBlockRow,
  type WhiffEventRow,
  type HabitInstanceRow,
} from "../src/db";
import { FRAME_EVENTS_VERSION } from "../src/pipeline/frameEvents";
import { moveIdToName } from "../src/pipeline/helpers";

let hashCounter = 0;

function seedGame(overrides: Partial<InsertGameParams> = {}): number {
  hashCounter++;
  const params: InsertGameParams = {
    sessionId: null,
    replayPath: `C:/replays/test-${hashCounter}.slp`,
    replayHash: `hash-${hashCounter}`,
    playedAt: "2026-07-01 12:00:00",
    stage: "Battlefield",
    durationSeconds: 180,
    playerCharacter: "Fox",
    opponentCharacter: "Marth",
    playerTag: "HERO",
    playerConnectCode: "HERO#123",
    opponentTag: "VILLAIN",
    opponentConnectCode: "VILN#456",
    result: "win",
    endMethod: "stocks",
    playerFinalStocks: 2,
    playerFinalPercent: 40,
    opponentFinalStocks: 0,
    opponentFinalPercent: 100,
    gameNumber: 1,
    ...overrides,
  };
  return insertGame(params);
}

function seedStats(gameId: number, overrides: Partial<InsertGameStatsParams> = {}): void {
  const params: InsertGameStatsParams = {
    gameId,
    neutralWins: 10,
    neutralLosses: 8,
    neutralWinRate: 0.55,
    counterHits: 3,
    openingsPerKill: 4,
    totalOpenings: 16,
    totalConversions: 10,
    conversionRate: 0.6,
    avgDamagePerOpening: 25,
    killConversions: 4,
    lCancelRate: 0.85,
    wavedashCount: 0,
    dashDanceFrames: 400,
    avgStagePositionX: 0,
    timeOnPlatform: 0.1,
    timeInAir: 0,
    timeAtLedge: 0,
    totalDamageTaken: 300,
    totalDamageDealt: 0,
    avgDeathPercent: 95,
    recoveryAttempts: 4,
    recoverySuccessRate: 0.75,
    ledgeEntropy: 0.5,
    knockdownEntropy: 0.5,
    shieldPressureEntropy: 0.5,
    powerShieldCount: 1,
    edgeguardAttempts: 3,
    edgeguardSuccessRate: 0.66,
    shieldPressureSequences: 5,
    shieldPressureAvgDamage: 12,
    shieldBreaks: 0,
    shieldPokeRate: 0.1,
    diSurvivalScore: 0.5,
    diComboScore: 0.5,
    diAvgComboLengthReceived: 2,
    diAvgComboLengthDealt: 3,
    ...overrides,
  };
  insertGameStats(params);
}

function mkDeath(overrides: Partial<StockDeathRow> = {}): StockDeathRow {
  return {
    victimIsPlayer: true,
    stockNumber: 1,
    startFrame: 0,
    endFrame: 1000,
    startPercent: 0,
    deathPercent: 100,
    killerMoveId: null,
    deathDirection: null,
    died: true,
    verdict: null,
    diScore: null,
    stickX: null,
    stickY: null,
    launchAngleDeg: null,
    resourceFault: false,
    finalHitFrame: null,
    ...overrides,
  };
}

function mkHabit(overrides: Partial<HabitInstanceRow> = {}): HabitInstanceRow {
  return {
    isPlayer: true,
    situation: "knockdown",
    option: "getup",
    frame: 500,
    percent: 60,
    cornered: false,
    pressured: false,
    punished: false,
    ...overrides,
  };
}

function mkSpan(overrides: Partial<RecoverySpanRow> = {}): RecoverySpanRow {
  return {
    recoveringIsPlayer: true,
    startFrame: 100,
    endFrame: 250,
    startX: -90,
    startY: -20,
    launchQuadrant: "left-low",
    djFrame: null,
    djEarly: false,
    route: null,
    upbDelay: null,
    airdodgeUsed: false,
    landing: "ledge",
    edgeguarderDepth: "onstage",
    edgeguarderInvincibleLedgeFrames: 0,
    contested: false,
    hitDuringRecovery: false,
    ...overrides,
  };
}

function mkBlock(overrides: Partial<ShieldBlockRow> = {}): ShieldBlockRow {
  return {
    defenderIsPlayer: true,
    blockFrame: 300,
    attackKind: "aerial",
    attackLabel: "fair",
    defenderActionableFrame: 310,
    attackerActionableFrame: 318,
    frameGap: 8,
    inGrabRange: true,
    choice: "grab OOS",
    grade: "neutral",
    stringId: 0,
    stringFinal: true,
    punishedAttacker: false,
    gotHit: false,
    ...overrides,
  };
}

function mkWhiff(overrides: Partial<WhiffEventRow> = {}): WhiffEventRow {
  return {
    whifferIsPlayer: false,
    startFrame: 400,
    vulnerableEndFrame: 430,
    attackLabel: "fsmash",
    attackKind: "grounded",
    minDistance: 20,
    opportunity: true,
    punished: false,
    reactionDelay: null,
    ...overrides,
  };
}

function mkConversion(overrides: Partial<ConversionEventRow> = {}): ConversionEventRow {
  return {
    attackerIsPlayer: true,
    startFrame: 600,
    endFrame: 800,
    startPercent: 0,
    endPercent: 30,
    damage: 30,
    moveCount: 3,
    openerMoveId: 2,
    lastMoveId: 16,
    openingType: "neutral-win",
    didKill: false,
    movesJson: "[]",
    ...overrides,
  };
}

beforeAll(() => {
  getDb();

  // ── Fox: two games WITH events, one without (backfill gap) ─────────
  const foxG1 = seedGame({ durationSeconds: 200, result: "win", playerFinalStocks: 4 });
  const foxG2 = seedGame({ durationSeconds: 100, result: "loss", playerFinalStocks: 0, opponentFinalStocks: 2 });
  const foxG3 = seedGame({ durationSeconds: 300, result: "win", playerFinalStocks: 2 }); // no event rows

  seedStats(foxG1, { wavedashCount: 10, totalDamageDealt: 300.5, timeInAir: 0.5, timeAtLedge: 0.1 });
  seedStats(foxG2, { wavedashCount: 20, totalDamageDealt: 200, timeInAir: 0.5, timeAtLedge: 0.1 });
  seedStats(foxG3, { wavedashCount: 30, totalDamageDealt: 99.5, timeInAir: 0.5, timeAtLedge: 0.1 });

  // Deaths: 3 own (GOOD_DI / NO_DI+resource-fault / SD), 1 survived stock,
  // 1 opponent death that must stay out of the deaths bucket.
  insertStockDeaths(foxG1, [
    mkDeath({ verdict: "GOOD_DI", deathPercent: 80, killerMoveId: 16, deathDirection: "up" }),
    mkDeath({
      stockNumber: 2,
      verdict: "NO_DI",
      deathPercent: 120,
      killerMoveId: 15,
      deathDirection: "left",
      resourceFault: true,
    }),
    mkDeath({ victimIsPlayer: false, verdict: "WRONG_DI", deathPercent: 90, deathDirection: "right" }),
  ]);
  insertStockDeaths(foxG2, [
    mkDeath({ verdict: "SD", deathPercent: 40, deathDirection: "down" }),
    mkDeath({ stockNumber: 2, died: false, deathPercent: null }),
  ]);

  // Throw DI: two up-throws (one no-DI) + a forward-throw; opponent row excluded.
  insertThrowDIRows(foxG1, [
    {
      victimIsPlayer: true,
      frame: 100,
      throwDirection: "up",
      percent: 30,
      stickX: 0,
      stickY: 0,
      sector: 0,
      noDI: true,
    },
    {
      victimIsPlayer: true,
      frame: 900,
      throwDirection: "up",
      percent: 70,
      stickX: 0.9,
      stickY: 0.2,
      sector: 0,
      noDI: false,
    },
    {
      victimIsPlayer: true,
      frame: 1400,
      throwDirection: "forward",
      percent: 50,
      stickX: 0.9,
      stickY: 0,
      sector: 4,
      noDI: false,
    },
    {
      victimIsPlayer: false,
      frame: 2000,
      throwDirection: "back",
      percent: 55,
      stickX: 0,
      stickY: 0,
      sector: 0,
      noDI: true,
    },
  ]);

  // Habits: knockdown getup ×3 with condition splits, ledge roll ×1;
  // opponent-side copies must not leak into the player profile.
  insertHabitInstances(foxG1, [
    mkHabit({ cornered: true, punished: true }),
    mkHabit({ pressured: true }),
    mkHabit(),
    mkHabit({ situation: "ledge", option: "roll", pressured: true, punished: true }),
    mkHabit({ isPlayer: false }),
    mkHabit({ isPlayer: false, situation: "ledge", option: "roll", punished: true }),
  ]);

  // Recovery: 3 own spans; 2 opponent spans = own edgeguard opportunities.
  insertRecoverySpans(foxG1, [
    mkSpan({ route: "low", landing: "ledge" }),
    mkSpan({ route: "high", landing: "death", djFrame: 110, djEarly: true, contested: true }),
    mkSpan({ landing: "stage", contested: true }),
    mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "deep", landing: "death", contested: true }),
    mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "ledge", edgeguarderInvincibleLedgeFrames: 12 }),
  ]);

  // Shield: own defense (fair ×3 incl. a mid-string block, dash attack ×1)
  // and own pressure received (nair ×2 on the opponent's shield).
  insertShieldBlocks(foxG2, [
    mkBlock({ grade: "punish-taken", frameGap: 10, punishedAttacker: true }),
    mkBlock({ grade: "punish-missed", frameGap: 8 }),
    mkBlock({ grade: "pressured", frameGap: null, stringFinal: false, choice: null }),
    mkBlock({
      attackKind: "grounded",
      attackLabel: "dash attack",
      grade: "correct-hold",
      frameGap: -1,
      choice: "hold shield",
    }),
    mkBlock({
      defenderIsPlayer: false,
      attackLabel: "nair",
      grade: "punish-taken",
      frameGap: -3,
      punishedAttacker: true,
    }),
    mkBlock({ defenderIsPlayer: false, attackLabel: "nair", grade: "neutral", frameGap: -5 }),
  ]);

  // Whiffs: opponent whiffs = capture chances (3 opportunities, 1 punished,
  // delays 10/20); own whiffs = exposure, capped top-N by total.
  insertWhiffEvents(foxG2, [
    mkWhiff({ punished: true, reactionDelay: 10 }),
    mkWhiff({ reactionDelay: 20 }),
    mkWhiff(),
    mkWhiff({ opportunity: false, minDistance: 80 }),
    mkWhiff({ whifferIsPlayer: true, attackLabel: "fsmash", punished: true, reactionDelay: 12 }),
    mkWhiff({ whifferIsPlayer: true, attackLabel: "fsmash", opportunity: false }),
    mkWhiff({ whifferIsPlayer: true, attackLabel: "grab", opportunity: false }),
  ]);

  // Conversions: 2 neutral-wins (one kill at 130%, one squandered at 105%),
  // 1 counter-attack; opponent conversion at 150% must not count anywhere.
  insertConversionEvents(foxG1, [
    mkConversion({ didKill: true, endPercent: 130, damage: 30, lastMoveId: 16 }),
    mkConversion({ endPercent: 105, damage: 45 }),
    mkConversion({ openingType: "counter-attack", endPercent: 60, damage: 20, lastMoveId: 13 }),
    mkConversion({ attackerIsPlayer: false, endPercent: 150, damage: 50 }),
  ]);

  // ── Marth: one game with events that must never leak into Fox ──────
  const marthG1 = seedGame({ playerCharacter: "Marth", opponentCharacter: "Fox", result: "win", playerFinalStocks: 4 });
  seedStats(marthG1, { wavedashCount: 500, totalDamageDealt: 999 });
  insertStockDeaths(marthG1, [mkDeath({ verdict: "WRONG_DI", deathPercent: 60, killerMoveId: 17 })]);
  insertHabitInstances(marthG1, [mkHabit({ punished: true }), mkHabit({ situation: "oos", option: "roll forward" })]);
  insertConversionEvents(marthG1, [mkConversion({ endPercent: 110 })]);
  insertWhiffEvents(marthG1, [mkWhiff({ punished: true, reactionDelay: 99 })]);
  insertRecoverySpans(marthG1, [mkSpan({ landing: "death" })]);
  insertShieldBlocks(marthG1, [mkBlock({ grade: "punish-missed" })]);
  insertThrowDIRows(marthG1, [
    {
      victimIsPlayer: true,
      frame: 50,
      throwDirection: "down",
      percent: 10,
      stickX: 0,
      stickY: 0,
      sector: 0,
      noDI: true,
    },
  ]);

  // ── Samus: each game has rows in exactly ONE event table, plus one with none ──
  const samus = () => seedGame({ playerCharacter: "Samus", opponentCharacter: "Fox" });
  insertConversionEvents(samus(), [mkConversion()]);
  insertStockDeaths(samus(), [mkDeath()]);
  insertHabitInstances(samus(), [mkHabit()]);
  insertThrowDIRows(samus(), [
    {
      victimIsPlayer: true,
      frame: 50,
      throwDirection: "up",
      percent: 10,
      stickX: 0,
      stickY: 0,
      sector: 0,
      noDI: false,
    },
  ]);
  insertRecoverySpans(samus(), [mkSpan()]);
  insertShieldBlocks(samus(), [mkBlock()]);
  // Two rows in one table for one game must still count that game once.
  insertWhiffEvents(samus(), [mkWhiff(), mkWhiff({ startFrame: 900, vulnerableEndFrame: 930 })]);
  samus(); // no event rows at all
});

afterAll(() => {
  closeDb();
  const home = os.homedir();
  if (home.includes("magi-character-events-")) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("getCharacterEventProfile", () => {
  it("counts total games and distinct games with events", () => {
    const profile = getCharacterEventProfile("Fox");
    expect(profile.character).toBe("Fox");
    expect(profile.totalGames).toBe(3);
    // Events exist in foxG1 and foxG2 only — foxG3 is a backfill gap. Each
    // event-bearing game appears in several tables but is counted once.
    expect(profile.gamesWithEvents).toBe(2);
  });

  it("counts a game whose only events are in a single table, whichever table that is", () => {
    const profile = getCharacterEventProfile("Samus");
    expect(profile.totalGames).toBe(8);
    // Seven games with rows in one table each; the eighth has none and must not count.
    expect(profile.gamesWithEvents).toBe(7);
  });

  it("does not count another character's event-bearing games", () => {
    // Fox, Marth and Samus all have event rows; a character with games but no
    // events of its own must report zero rather than picking up theirs.
    seedGame({ playerCharacter: "Yoshi", opponentCharacter: "Fox" });
    const profile = getCharacterEventProfile("Yoshi");
    expect(profile.totalGames).toBe(1);
    expect(profile.gamesWithEvents).toBe(0);
  });

  it("isolates per-character data — Marth rows never leak into Fox", () => {
    const fox = getCharacterEventProfile("Fox");
    expect(fox.deaths.verdicts.find((v) => v.verdict === "WRONG_DI")).toBeUndefined();
    expect(fox.habits.find((h) => h.situation === "oos")).toBeUndefined();
    expect(fox.deaths.killerMoves.find((m) => m.moveId === 17)).toBeUndefined();
    expect(fox.deaths.throwDI.find((t) => t.direction === "down")).toBeUndefined();
    expect(fox.trivia.totalWavedashes).toBe(60);

    const marth = getCharacterEventProfile("Marth");
    expect(marth.totalGames).toBe(1);
    expect(marth.gamesWithEvents).toBe(1);
    expect(marth.deaths.total).toBe(1);
    expect(marth.deaths.verdicts).toEqual([{ verdict: "WRONG_DI", count: 1 }]);
    expect(marth.conversions.squanderedKillPercent).toBe(1);
    expect(marth.trivia.totalWavedashes).toBe(500);
  });

  it("filters deaths to the player's own died stocks and distributes verdicts", () => {
    const { deaths } = getCharacterEventProfile("Fox");
    // 3 died player stocks — the survived stock and the opponent's death are out.
    expect(deaths.total).toBe(3);
    expect(deaths.avgDeathPercent).toBe(80); // (80 + 120 + 40) / 3
    expect(deaths.resourceFaults).toBe(1);
    const byVerdict = Object.fromEntries(deaths.verdicts.map((v) => [v.verdict, v.count]));
    expect(byVerdict).toEqual({ GOOD_DI: 1, NO_DI: 1, SD: 1 });
    const byDirection = Object.fromEntries(deaths.directions.map((d) => [d.direction, d.count]));
    expect(byDirection).toEqual({ up: 1, left: 1, down: 1 });
  });

  it("resolves killer move names from the shared move-id mapping", () => {
    const { deaths } = getCharacterEventProfile("Fox");
    expect(deaths.killerMoves).toHaveLength(2);
    const uair = deaths.killerMoves.find((m) => m.moveId === 16);
    expect(uair).toMatchObject({ moveName: "uair", count: 1, avgDeathPercent: 80 });
    expect(deaths.killerMoves.find((m) => m.moveId === 15)?.moveName).toBe("bair");
  });

  it("groups victim-side throw DI by direction", () => {
    const { deaths } = getCharacterEventProfile("Fox");
    expect(deaths.throwDI).toEqual([
      { direction: "up", total: 2, noDI: 1 },
      { direction: "forward", total: 1, noDI: 0 },
    ]);
  });

  it("splits habit options by cornered/pressured/punished conditions", () => {
    const { habits } = getCharacterEventProfile("Fox");
    // Opponent-side habit copies are excluded: 2 player rows only.
    expect(habits).toHaveLength(2);
    const getup = habits.find((h) => h.situation === "knockdown" && h.option === "getup");
    expect(getup).toEqual({
      situation: "knockdown",
      option: "getup",
      total: 3,
      punished: 1,
      cornered: 1,
      corneredPunished: 1,
      pressured: 1,
      pressuredPunished: 0,
    });
    const roll = habits.find((h) => h.situation === "ledge" && h.option === "roll");
    expect(roll).toMatchObject({ total: 1, punished: 1, pressured: 1, pressuredPunished: 1 });
  });

  it("keeps own recovery spans and opponent spans in separate buckets", () => {
    const { recovery } = getCharacterEventProfile("Fox");
    expect(recovery.ownSpans).toBe(3);
    const byRoute = Object.fromEntries(recovery.routes.map((r) => [r.route, r]));
    expect(byRoute["low"]).toMatchObject({ total: 1, died: 0 });
    expect(byRoute["high"]).toMatchObject({ total: 1, died: 1 });
    expect(recovery.routes).toHaveLength(2); // NULL-route span is not a route row
    expect(recovery.djEarly).toEqual({ total: 1, died: 1 });
    expect(recovery.contested).toEqual({ total: 2, died: 1 });
    const byLanding = Object.fromEntries(recovery.landings.map((l) => [l.landing, l.count]));
    expect(byLanding).toEqual({ ledge: 1, death: 1, stage: 1 });

    // Opponent spans = this player's edgeguard opportunities, not own spans.
    expect(recovery.edgeguard.opportunities).toBe(2);
    expect(recovery.edgeguard.invincibleLedgeSpans).toBe(1);
    const byDepth = Object.fromEntries(recovery.edgeguard.byDepth.map((d) => [d.depth, d]));
    expect(byDepth["deep"]).toMatchObject({ total: 1, kills: 1 });
    expect(byDepth["ledge"]).toMatchObject({ total: 1, kills: 0 });
  });

  it("separates shield defense (own blocks) from pressure received", () => {
    const { shield } = getCharacterEventProfile("Fox");
    expect(shield.defense.total).toBe(4);
    const grades = Object.fromEntries(shield.defense.grades.map((g) => [g.grade, g.count]));
    expect(grades).toEqual({ "punish-taken": 1, "punish-missed": 1, pressured: 1, "correct-hold": 1 });
    const fair = shield.defense.byMove.find((m) => m.attackLabel === "fair");
    // AVG skips the NULL mid-string gap: (10 + 8) / 2.
    expect(fair).toEqual({ attackLabel: "fair", blocks: 3, punishTaken: 1, punishMissed: 1, avgFrameGap: 9 });

    expect(shield.pressure.total).toBe(2);
    expect(shield.pressure.byMove).toEqual([
      { attackLabel: "nair", blocks: 2, punishedByDefender: 1, avgFrameGap: -4 },
    ]);
  });

  it("computes whiff capture rate from opponent whiffs and exposure from own", () => {
    const { whiffs } = getCharacterEventProfile("Fox");
    // Opponent opportunity rows only — the out-of-range whiff is excluded.
    expect(whiffs.captureOpportunities).toBe(3);
    expect(whiffs.capturePunished).toBe(1);
    expect(whiffs.captureMedianReactionDelay).toBe(15); // median of [10, 20]
    const byLabel = Object.fromEntries(whiffs.exposure.map((e) => [e.attackLabel, e]));
    expect(byLabel["fsmash"]).toMatchObject({ total: 2, opportunities: 1, punished: 1 });
    expect(byLabel["grab"]).toMatchObject({ total: 1, opportunities: 0, punished: 0 });
  });

  it("aggregates own conversions and counts squandered kill percent", () => {
    const { conversions } = getCharacterEventProfile("Fox");
    expect(conversions.total).toBe(3); // opponent's conversion excluded
    const byType = Object.fromEntries(conversions.byOpeningType.map((o) => [o.openingType, o]));
    expect(byType["neutral-win"]).toMatchObject({ count: 2, avgDamage: 37.5, kills: 1 });
    expect(byType["counter-attack"]).toMatchObject({ count: 1, avgDamage: 20, kills: 0 });
    expect(conversions.killMoves).toEqual([{ moveId: 16, moveName: "uair", count: 1, avgKillPercent: 130 }]);
    // Reached 105% without killing = 1; the opponent's 150% conversion is not ours.
    expect(conversions.squanderedKillPercent).toBe(1);
  });

  it("sums trivia across all of the character's games", () => {
    const { trivia } = getCharacterEventProfile("Fox");
    expect(trivia.totalPlaytimeSeconds).toBe(600); // 200 + 100 + 300
    expect(trivia.longestGameSeconds).toBe(300);
    expect(trivia.fourStockWins).toBe(1); // only foxG1 won with 4 stocks
    expect(trivia.sdCount).toBe(1);
    expect(trivia.totalDamageDealt).toBe(600); // 300.5 + 200 + 99.5
    expect(trivia.totalWavedashes).toBe(60);
    // time_in_air / time_at_ledge are fractions of the game — seconds = fraction × duration.
    expect(trivia.airtimeSeconds).toBe(300); // 0.5 × (200 + 100 + 300)
    expect(trivia.ledgeSeconds).toBe(60); // 0.1 × 600
    expect(trivia.totalLasersOrProjectiles).toBeNull();
  });

  it("returns an empty profile for a character with no games", () => {
    const profile = getCharacterEventProfile("Bowser");
    expect(profile.totalGames).toBe(0);
    expect(profile.gamesWithEvents).toBe(0);
    expect(profile.habits).toEqual([]);
    expect(profile.deaths.total).toBe(0);
    expect(profile.deaths.avgDeathPercent).toBeNull();
    expect(profile.recovery.ownSpans).toBe(0);
    expect(profile.recovery.edgeguard.opportunities).toBe(0);
    expect(profile.shield.defense.total).toBe(0);
    expect(profile.whiffs.captureOpportunities).toBe(0);
    expect(profile.whiffs.captureMedianReactionDelay).toBeNull();
    expect(profile.conversions.total).toBe(0);
    expect(profile.trivia.totalPlaytimeSeconds).toBe(0);
    expect(profile.trivia.longestGameSeconds).toBeNull();
  });
});

// ── Row order is independent of the query plan ───────────────────────
//
// db.ts "Row-order contract": every list is ordered by its measure DESC and
// then by the grouped key ASC (label text, or move id numerically), so tied
// rows come back in one documented order and a tie at a LIMIT always keeps the
// same rows. Before the tie-breakers, running ANALYZE on a real database
// changed which tied move made `unpunishedByMove` and the order of ~500 lists.
//
// Each tie character gets ONE game holding every tie, seeded either in the
// order below or fully reversed; both must produce identical lists.

const KILLER_TIE_IDS = [17, 16, 15, 14, 13, 12, 11, 10, 9]; // nine moves, one death each
const KILL_MOVE_TIE_IDS = [18, 17, 16, 15, 14, 13, 12, 11, 10]; // nine moves, one kill each
const EXPOSURE_LABELS = [
  "usmash",
  "uair",
  "nair",
  "jab",
  "grab",
  "ftilt",
  "fsmash",
  "fair",
  "dtilt",
  "dsmash",
  "dash attack",
  "dair",
  "bair",
]; // thirteen labels, one own whiff each (plus "utilt" twice)
const CAPTURE_LABELS = ["usmash", "grab", "ftilt", "dtilt", "dsmash", "dash attack"]; // one unpunished each (plus "fsmash" twice)

function seedTieCharacter(character: string, options: { reverse?: boolean; extraDeathMoveId?: number } = {}): number {
  const order = <T>(rows: T[]): T[] => (options.reverse ? [...rows].reverse() : rows);
  const gameId = seedGame({ playerCharacter: character, opponentCharacter: "Fox" });
  setGameEventsVersion(gameId, FRAME_EVENTS_VERSION); // death verdicts / killers only count current games

  // Deaths: move 20 twice, then nine moves once each. Verdicts 3/3/3/2, directions 4/4/3.
  const verdicts = ["NO_DI", "WRONG_DI", "WRONG_DI", "WRONG_DI", "GOOD_DI", "GOOD_DI", "GOOD_DI", "FAILED_RECOVERY"];
  const deaths: StockDeathRow[] = [
    mkDeath({ killerMoveId: 20, verdict: "NO_DI", deathDirection: "up" }),
    mkDeath({ killerMoveId: 20, verdict: "NO_DI", deathDirection: "up" }),
    ...KILLER_TIE_IDS.map((killerMoveId, i) =>
      mkDeath({
        killerMoveId,
        verdict: verdicts[i] ?? "FAILED_RECOVERY",
        deathDirection: i < 2 ? "up" : i < 6 ? "left" : "right",
      }),
    ),
  ];
  if (options.extraDeathMoveId != null) {
    deaths.push(mkDeath({ killerMoveId: options.extraDeathMoveId, verdict: "NO_DI", deathDirection: "up" }));
  }
  insertStockDeaths(gameId, order(deaths));

  const throwRow = (throwDirection: string) => ({
    victimIsPlayer: true,
    frame: 100,
    throwDirection,
    percent: 30,
    stickX: 0,
    stickY: 0,
    sector: 0,
    noDI: false,
  });
  insertThrowDIRows(gameId, order(["up", "up", "down", "down", "back"].map(throwRow)));

  insertHabitInstances(
    gameId,
    order([
      ...["roll", "roll", "jump", "jump", "attack", "attack", "stand", "stand", "stand"].map((option) =>
        mkHabit({ situation: "ledge", option }),
      ),
      mkHabit({ situation: "knockdown", option: "tech in place" }),
      mkHabit({ situation: "knockdown", option: "getup" }),
    ]),
  );

  insertRecoverySpans(
    gameId,
    order([
      mkSpan({ route: "low", landing: "stage" }),
      mkSpan({ route: "low", landing: "stage" }),
      mkSpan({ route: "high", landing: "ledge" }),
      mkSpan({ route: "high", landing: "ledge" }),
      mkSpan({ route: "mid", landing: "death" }),
      mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "shallow" }),
      mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "shallow" }),
      mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "deep" }),
      mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "deep" }),
      mkSpan({ recoveringIsPlayer: false, edgeguarderDepth: "ledge" }),
    ]),
  );

  // Own blocks: bair ×3, then three labels ×2; grades 3/3/3. Pressure: three labels ×1.
  insertShieldBlocks(
    gameId,
    order([
      mkBlock({ attackLabel: "nair", grade: "correct-hold" }),
      mkBlock({ attackLabel: "nair", grade: "correct-hold" }),
      mkBlock({ attackLabel: "fair", grade: "correct-hold" }),
      mkBlock({ attackLabel: "fair", grade: "punish-missed" }),
      mkBlock({ attackLabel: "dash attack", grade: "punish-missed" }),
      mkBlock({ attackLabel: "dash attack", grade: "punish-missed" }),
      mkBlock({ attackLabel: "bair", grade: "punish-taken" }),
      mkBlock({ attackLabel: "bair", grade: "punish-taken" }),
      mkBlock({ attackLabel: "bair", grade: "punish-taken" }),
      mkBlock({ defenderIsPlayer: false, attackLabel: "uair" }),
      mkBlock({ defenderIsPlayer: false, attackLabel: "dair" }),
      mkBlock({ defenderIsPlayer: false, attackLabel: "bair" }),
    ]),
  );

  insertWhiffEvents(
    gameId,
    order([
      // Opponent whiffs left unpunished: seven labels, top 5 kept by getPatternData.
      mkWhiff({ attackLabel: "fsmash" }),
      mkWhiff({ attackLabel: "fsmash" }),
      ...CAPTURE_LABELS.map((attackLabel) => mkWhiff({ attackLabel })),
      // Own whiffs: fourteen labels, top 12 kept by getCharacterEventProfile.
      mkWhiff({ whifferIsPlayer: true, attackLabel: "utilt" }),
      mkWhiff({ whifferIsPlayer: true, attackLabel: "utilt" }),
      ...EXPOSURE_LABELS.map((attackLabel) => mkWhiff({ whifferIsPlayer: true, attackLabel })),
    ]),
  );

  // Own kills: move 21 twice, then nine moves once each. Opening types 4/4/3.
  const openings = [
    "neutral-win",
    "neutral-win",
    "counter-attack",
    "counter-attack",
    "counter-attack",
    "counter-attack",
  ];
  insertConversionEvents(
    gameId,
    order([
      mkConversion({ didKill: true, lastMoveId: 21, openingType: "neutral-win" }),
      mkConversion({ didKill: true, lastMoveId: 21, openingType: "neutral-win" }),
      ...KILL_MOVE_TIE_IDS.map((lastMoveId, i) =>
        mkConversion({ didKill: true, lastMoveId, openingType: openings[i] ?? "trade" }),
      ),
    ]),
  );
  return gameId;
}

/** Everything order-sensitive the two stats functions return for one character. */
function orderedLists(character: string) {
  const profile = getCharacterEventProfile(character);
  const pattern = getPatternData({ label: "tie", character });
  if (!pattern) throw new Error(`no pattern data for ${character}`);
  return {
    profile: {
      habits: profile.habits.map((h) => `${h.situation}/${h.option}:${h.total}`),
      verdicts: profile.deaths.verdicts.map((v) => `${v.verdict}:${v.count}`),
      killerMoves: profile.deaths.killerMoves.map((m) => `${m.moveId}:${m.count}`),
      directions: profile.deaths.directions.map((d) => `${d.direction}:${d.count}`),
      throwDI: profile.deaths.throwDI.map((t) => `${t.direction}:${t.total}`),
      routes: profile.recovery.routes.map((r) => `${r.route}:${r.total}`),
      landings: profile.recovery.landings.map((l) => `${l.landing}:${l.count}`),
      byDepth: profile.recovery.edgeguard.byDepth.map((d) => `${d.depth}:${d.total}`),
      grades: profile.shield.defense.grades.map((g) => `${g.grade}:${g.count}`),
      defenseByMove: profile.shield.defense.byMove.map((m) => `${m.attackLabel}:${m.blocks}`),
      pressureByMove: profile.shield.pressure.byMove.map((m) => `${m.attackLabel}:${m.blocks}`),
      exposure: profile.whiffs.exposure.map((e) => `${e.attackLabel}:${e.total}`),
      byOpeningType: profile.conversions.byOpeningType.map((o) => `${o.openingType}:${o.count}`),
      killMoves: profile.conversions.killMoves.map((m) => `${m.moveId}:${m.count}`),
    },
    pattern: {
      habits: pattern.habits.map((h) => `${h.situation}/${h.option}:${h.total}`),
      // Object key order is what a consumer iterating the record would see.
      verdicts: Object.entries(pattern.deaths.verdicts).map(([verdict, count]) => `${verdict}:${count}`),
      byKiller: pattern.deaths.byKiller.map((k) => `${k.move}:${k.count}`),
      throwDI: pattern.throwDI.map((t) => `${t.direction}:${t.total}`),
      unpunishedByMove: pattern.whiffCapture.unpunishedByMove.map((m) => `${m.move}:${m.count}`),
      whiffExposure: pattern.whiffExposure.map((w) => `${w.move}:${w.opportunities}`),
      shieldByMove: pattern.shieldDefense.byMove.map((m) => `${m.move}:${m.graded}`),
      routes: pattern.recovery.routes.map((r) => `${r.route}:${r.total}`),
      byDepth: pattern.edgeguard.byDepth.map((d) => `${d.depth}:${d.total}`),
    },
  };
}

const moveLabel = (id: number, count: number) => `${moveIdToName[id]}:${count}`;

describe("row order is independent of the query plan", () => {
  beforeAll(() => {
    seedTieCharacter("Falco");
    seedTieCharacter("Peach", { reverse: true });
  });

  it("returns tied rows in the documented order: measure DESC, then label / move id ASC", () => {
    expect(orderedLists("Falco")).toEqual({
      profile: {
        // Grouped by situation first; "stand" (3) outranks the alphabetically earlier options (2).
        habits: [
          "knockdown/getup:1",
          "knockdown/tech in place:1",
          "ledge/stand:3",
          "ledge/attack:2",
          "ledge/jump:2",
          "ledge/roll:2",
        ],
        verdicts: ["GOOD_DI:3", "NO_DI:3", "WRONG_DI:3", "FAILED_RECOVERY:2"],
        // LIMIT 8: the 2-death move, then the seven LOWEST tied move ids.
        killerMoves: ["20:2", "9:1", "10:1", "11:1", "12:1", "13:1", "14:1", "15:1"],
        directions: ["left:4", "up:4", "right:3"],
        throwDI: ["down:2", "up:2", "back:1"],
        routes: ["high:2", "low:2", "mid:1"],
        landings: ["ledge:2", "stage:2", "death:1"],
        byDepth: ["deep:2", "shallow:2", "ledge:1"],
        grades: ["correct-hold:3", "punish-missed:3", "punish-taken:3"],
        defenseByMove: ["bair:3", "dash attack:2", "fair:2", "nair:2"],
        pressureByMove: ["bair:1", "dair:1", "uair:1"],
        // LIMIT 12: "utilt" (2), then the eleven alphabetically first of thirteen tied labels.
        exposure: [
          "utilt:2",
          "bair:1",
          "dair:1",
          "dash attack:1",
          "dsmash:1",
          "dtilt:1",
          "fair:1",
          "fsmash:1",
          "ftilt:1",
          "grab:1",
          "jab:1",
          "nair:1",
        ],
        byOpeningType: ["counter-attack:4", "neutral-win:4", "trade:3"],
        killMoves: ["21:2", "10:1", "11:1", "12:1", "13:1", "14:1", "15:1", "16:1"],
      },
      pattern: {
        habits: [
          "knockdown/getup:1",
          "knockdown/tech in place:1",
          "ledge/stand:3",
          "ledge/attack:2",
          "ledge/jump:2",
          "ledge/roll:2",
        ],
        verdicts: ["GOOD_DI:3", "NO_DI:3", "WRONG_DI:3", "FAILED_RECOVERY:2"],
        byKiller: [
          moveLabel(20, 2),
          moveLabel(9, 1),
          moveLabel(10, 1),
          moveLabel(11, 1),
          moveLabel(12, 1),
          moveLabel(13, 1),
          moveLabel(14, 1),
          moveLabel(15, 1),
        ],
        throwDI: ["down:2", "up:2", "back:1"],
        // LIMIT 5: "fsmash" (2), then the four alphabetically first of six tied labels.
        unpunishedByMove: ["fsmash:2", "dash attack:1", "dsmash:1", "dtilt:1", "ftilt:1"],
        whiffExposure: ["utilt:2", ...[...EXPOSURE_LABELS].sort().map((label) => `${label}:1`)],
        shieldByMove: ["bair:3", "dash attack:2", "fair:2", "nair:2"],
        routes: ["high:2", "low:2", "mid:1"],
        byDepth: ["deep:2", "shallow:2", "ledge:1"],
      },
    });
  });

  it("never lets a tie at the LIMIT boundary admit the row the rule excludes", () => {
    const { profile, pattern } = orderedLists("Falco");
    // Tied with rows that made the cut, but later in the documented order.
    expect(profile.killerMoves).not.toContain("16:1");
    expect(profile.killerMoves).not.toContain("17:1");
    expect(profile.killMoves).not.toContain("17:1");
    expect(profile.killMoves).not.toContain("18:1");
    expect(profile.exposure).not.toContain("uair:1");
    expect(profile.exposure).not.toContain("usmash:1");
    expect(pattern.byKiller).not.toContain(moveLabel(16, 1));
    expect(pattern.byKiller).not.toContain(moveLabel(17, 1));
    expect(pattern.unpunishedByMove).not.toContain("grab:1");
    expect(pattern.unpunishedByMove).not.toContain("usmash:1");
  });

  it("returns the same lists when the same events were stored in the opposite order", () => {
    // Peach holds Falco's rows inserted back to front (reversed rowids).
    expect(orderedLists("Peach")).toEqual(orderedLists("Falco"));
  });

  it("lets a higher count beat the tie-breaker, displacing only the last tied row", () => {
    // Same data plus one more death to move 17 — excluded above as a tied row.
    seedTieCharacter("Roy", { extraDeathMoveId: 17 });
    const { profile, pattern } = orderedLists("Roy");
    // 17 now has 2 deaths: it ranks right after 20 (2 deaths, lower id) and pushes out 15.
    expect(profile.killerMoves).toEqual(["17:2", "20:2", "9:1", "10:1", "11:1", "12:1", "13:1", "14:1"]);
    expect(pattern.byKiller).toEqual([
      moveLabel(17, 2),
      moveLabel(20, 2),
      moveLabel(9, 1),
      moveLabel(10, 1),
      moveLabel(11, 1),
      moveLabel(12, 1),
      moveLabel(13, 1),
      moveLabel(14, 1),
    ]);
    // Counts are untouched by ordering: 12 deaths in, 12 counted.
    expect(getCharacterEventProfile("Roy").deaths.total).toBe(12);
    expect(getPatternData({ label: "tie", character: "Roy" })?.deaths.total).toBe(12);
  });

  it("returns identical results with planner statistics, without them, and with unordered scans reversed", () => {
    const snapshot = () =>
      JSON.stringify(
        ["Fox", "Marth", "Samus", "Falco", "Peach", "Roy"].map((character) => [
          getCharacterEventProfile(character),
          getPatternData({ label: "x", character }),
          getPatternData({ label: "x", character, opponentCharacter: "Fox" }),
        ]),
      );
    const db = getDb();
    // Statistics rows for the tables the stats queries read.
    const statRows = () =>
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'sqlite_stat1'").get()
        ? (db.prepare("SELECT COUNT(*) as n FROM sqlite_stat1 WHERE tbl <> 'schema_version'").get() as { n: number }).n
        : 0;

    // The schema migration ran ANALYZE while every game and event table was still
    // empty, so the seeded rows above have been queried with no statistics so far.
    expect(statRows()).toBe(0);
    const withoutStatistics = snapshot();

    db.exec("ANALYZE");
    expect(statRows()).toBeGreaterThan(0);
    expect(snapshot()).toBe(withoutStatistics);

    // SQLite's own probe for results that lean on an undefined row order.
    db.pragma("reverse_unordered_selects = ON");
    try {
      expect(snapshot()).toBe(withoutStatistics);
    } finally {
      db.pragma("reverse_unordered_selects = OFF");
    }
  });

  it("refreshes planner statistics when the database closes, without changing results", () => {
    const before = JSON.stringify(orderedLists("Falco"));
    // Put the database back in a new install's state: data, but no statistics.
    getDb().exec("DELETE FROM sqlite_stat1");
    closeDb();
    const session = getDb(); // a fresh connection that has never seen statistics
    expect((session.prepare("SELECT COUNT(*) as n FROM sqlite_stat1").get() as { n: number }).n).toBe(0);
    expect(JSON.stringify(orderedLists("Falco"))).toBe(before);
    closeDb(); // PRAGMA optimize = 0x10002 analyzes every table that lacks statistics

    const reopened = getDb();
    const stat = reopened
      .prepare("SELECT stat FROM sqlite_stat1 WHERE tbl = 'stock_deaths' AND idx = 'idx_stock_deaths_game'")
      .get() as { stat: string } | undefined;
    // Exact row count, not a sampled estimate: "<rows in table> <avg rows per game>".
    const total = (reopened.prepare("SELECT COUNT(*) as n FROM stock_deaths").get() as { n: number }).n;
    expect(stat?.stat.split(" ")[0]).toBe(String(total));
    expect(JSON.stringify(orderedLists("Falco"))).toBe(before);
  });
});

describe("db.ts row-order contract (source guard)", () => {
  const dbSource = fs.readFileSync(path.resolve(__dirname, "../src/db.ts"), "utf-8");
  const codeLines = dbSource.split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  /** Sort keys of an ORDER BY clause, split on top-level commas only. */
  function sortKeys(clause: string): string[] {
    const keys: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of clause) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        keys.push(current.trim());
        current = "";
      } else current += ch;
    }
    if (current.trim()) keys.push(current.trim());
    return keys;
  }

  /** The ORDER BY clause on a source line: up to LIMIT or the end of the SQL text. */
  function orderByClause(line: string): string | null {
    const at = line.indexOf("ORDER BY ");
    if (at < 0) return null;
    return line
      .slice(at + "ORDER BY ".length)
      .replace(/\s+LIMIT\b.*$/, "")
      .replace(/[`"].*$/, "")
      .trim();
  }

  // A single sort key is only acceptable when it is unique within the result
  // (so no tie exists) or when tied rows are indistinguishable.
  const SINGLE_KEY_ALLOWED = new Set([
    "g.id ASC", // unique
    "g.id ${limitSql}", // unique
    "css.game_id ASC", // primary key
    "opponent_character ASC", // SELECT DISTINCT on this column
    "stage ASC", // SELECT DISTINCT on this column
    "w.reaction_delay", // one-column result: tied rows are the same value (median input)
    // Coaching-text and chat lookups, not stats lists.
    "ca.created_at DESC",
    "created_at DESC",
    "created_at ASC",
  ]);

  const clauses = codeLines.map(orderByClause).filter((c): c is string => c != null);

  it("finds the queries it is meant to guard", () => {
    expect(clauses.length).toBeGreaterThan(70);
    expect(clauses).toContain("count DESC, sd.killer_move_id ASC");
    expect(clauses).toContain("COALESCE(g.played_at, '') DESC, g.id DESC");
  });

  it("gives every GROUP BY list an ORDER BY", () => {
    const code = codeLines.join("\n");
    const unordered: string[] = [];
    for (const match of code.matchAll(/GROUP BY [^\n]*/g)) {
      // The statement's own ORDER BY comes before the next statement starts.
      const rest = code.slice(match.index, match.index + 600);
      const nextStatement = rest.slice(1).search(/GROUP BY |\.prepare\(|\bq<|\bone</);
      const statement = nextStatement < 0 ? rest : rest.slice(0, nextStatement + 1);
      if (!statement.includes("ORDER BY ")) unordered.push(match[0]);
    }
    expect(unordered).toEqual([]);
  });

  it("never sorts a list by a non-unique key alone", () => {
    const offenders = clauses.filter((clause) => sortKeys(clause).length < 2 && !SINGLE_KEY_ALLOWED.has(clause));
    expect(offenders).toEqual([]);
  });

  it("rejects the shapes that caused plan-dependent lists (guard self-check)", () => {
    expect(orderByClause("    ORDER BY count DESC")).toBe("count DESC");
    expect(orderByClause("    GROUP BY w.attack_label ORDER BY count DESC LIMIT 5`);")).toBe("count DESC");
    expect(sortKeys("count DESC")).toHaveLength(1);
    expect(sortKeys("COALESCE(g.played_at, '') DESC, g.id DESC")).toHaveLength(2);
    expect(SINGLE_KEY_ALLOWED.has("count DESC")).toBe(false);
    expect(SINGLE_KEY_ALLOWED.has("g.played_at DESC")).toBe(false);
  });
});
