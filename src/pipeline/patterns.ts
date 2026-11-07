// ── Recurring-pattern comparison (game vs matchup history vs character history) ──
//
// One shape (PatternData) is filled three ways — from a single game's frame
// events, and from the per-instance DB tables for the matchup and character
// history (db.ts getPatternData) — so the coaching prompt can show the same
// measured habits side by side. A single game rarely has enough samples to
// call anything a habit; the history columns are what make a pattern real,
// and the "this game" column is what makes it relevant today.
//
// Every number is a count with its denominator. Definitions match the
// detectors (frameEvents / measuredDI / shieldEvents / whiffEvents /
// recoveryEvents) and are restated in the block so the model cannot drift.

import { EVENT_SAMPLE_GUARDS } from "../characterEventProfile.js";
import type { GameFrameEvents, PlayerSlot } from "./frameEvents.js";
import { moveIdToName, getMoveName } from "./helpers.js";

export interface PatternHabit {
  situation: string;
  option: string;
  total: number;
  /** Instances from games parsed with the current detectors (punish flags are only trusted there). */
  punishedOf: number;
  punished: number;
}

export interface PatternKiller {
  move: string;
  count: number;
  avgPercent: number | null;
  noDI: number;
  wrongDI: number;
  helpfulDI: number;
  failedRecovery: number;
}

export interface PatternData {
  label: string;
  games: number;
  /** Games whose death verdicts / habit punish flags come from the current detectors. */
  currentGames: number;
  habits: PatternHabit[];
  deaths: {
    total: number;
    verdicts: Record<string, number>;
    resourceFaults: number;
    byKiller: PatternKiller[];
  };
  throwDI: { direction: string; total: number; noDI: number }[];
  whiffCapture: { opportunities: number; punished: number; unpunishedByMove: { move: string; count: number }[] };
  whiffExposure: { move: string; opportunities: number; punished: number }[];
  shieldDefense: {
    graded: number;
    taken: number;
    missed: number;
    byMove: { move: string; graded: number; taken: number; missed: number }[];
  };
  shieldPressure: { graded: number; unsafe: number; punished: number };
  recovery: {
    spans: number;
    died: number;
    routes: { route: string; total: number; died: number }[];
    djEarly: number;
    djEarlyDied: number;
  };
  edgeguard: { opportunities: number; kills: number; byDepth: { depth: string; total: number; kills: number }[] };
}

export interface RecurringPatterns {
  /** Character-wide history (most recent games with event data, current game excluded). */
  character: PatternData | null;
  /** Same character vs the same opponent character, when the history exists. */
  matchup: PatternData | null;
}

function countBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

const HELPFUL_DI = new Set(["GOOD_DI", "OK_DI"]);

/** Measured patterns for one player in one game, in the same shape as the DB history. */
export function patternsFromFrameEvents(events: GameFrameEvents, slot: PlayerSlot, label: string): PatternData {
  const habits: PatternHabit[] = [
    ...countBy(
      events.habits.filter((h) => h.playerSlot === slot),
      (h) => `${h.situation}\u0000${h.option}`,
    ).values(),
  ].map((list) => ({
    situation: list[0]!.situation,
    option: list[0]!.option,
    total: list.length,
    punishedOf: list.length,
    punished: list.filter((h) => h.punished).length,
  }));

  const deaths = events.stocks.filter((s) => s.victimSlot === slot && s.died);
  const verdicts: Record<string, number> = {};
  for (const d of deaths) verdicts[d.verdict ?? "UNKNOWN"] = (verdicts[d.verdict ?? "UNKNOWN"] ?? 0) + 1;
  const byKiller: PatternKiller[] = [
    ...countBy(
      deaths.filter((d) => d.killerMoveId != null),
      (d) => String(d.killerMoveId),
    ).values(),
  ]
    .map((list) => {
      const id = list[0]!.killerMoveId!;
      const pcts = list.map((d) => d.deathPercent).filter((p): p is number => p != null);
      return {
        move: moveIdToName[id] ?? getMoveName(id),
        count: list.length,
        avgPercent: pcts.length > 0 ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
        noDI: list.filter((d) => d.verdict === "NO_DI").length,
        wrongDI: list.filter((d) => d.verdict === "WRONG_DI").length,
        helpfulDI: list.filter((d) => d.verdict != null && HELPFUL_DI.has(d.verdict)).length,
        failedRecovery: list.filter((d) => d.verdict === "FAILED_RECOVERY").length,
      };
    })
    .sort((a, b) => b.count - a.count);

  const throwDI = [
    ...countBy(
      events.throwDI.filter((t) => t.victimSlot === slot),
      (t) => t.throwDirection,
    ).entries(),
  ].map(([direction, list]) => ({
    direction,
    total: list.length,
    noDI: list.filter((t) => t.noDI).length,
  }));

  const offered = events.whiffs.filter((w) => w.whifferSlot !== slot && w.opportunity);
  const unpunishedByMove = [
    ...countBy(
      offered.filter((w) => !w.punished),
      (w) => w.attackLabel,
    ).entries(),
  ]
    .map(([move, list]) => ({ move, count: list.length }))
    .sort((a, b) => b.count - a.count);
  const whiffExposure = [
    ...countBy(
      events.whiffs.filter((w) => w.whifferSlot === slot && w.opportunity),
      (w) => w.attackLabel,
    ).entries(),
  ].map(([move, list]) => ({
    move,
    opportunities: list.length,
    punished: list.filter((w) => w.punished).length,
  }));

  const graded = (defender: (s: PlayerSlot) => boolean) =>
    events.shieldBlocks.filter((b) => defender(b.defenderSlot) && b.stringFinal && b.frameGap != null);
  const ownBlocks = graded((s) => s === slot);
  const theirBlocks = graded((s) => s !== slot);
  const shieldByMove = [...countBy(ownBlocks, (b) => b.attackLabel).entries()].map(([move, list]) => ({
    move,
    graded: list.length,
    taken: list.filter((b) => b.grade === "punish-taken").length,
    missed: list.filter((b) => b.grade === "punish-missed").length,
  }));

  const ownSpans = events.recoverySpans.filter((r) => r.playerSlot === slot);
  const theirSpans = events.recoverySpans.filter((r) => r.playerSlot !== slot);
  const routes = [
    ...countBy(
      ownSpans.filter((r) => r.route != null),
      (r) => r.route!,
    ).entries(),
  ].map(([route, list]) => ({
    route,
    total: list.length,
    died: list.filter((r) => r.landing === "death").length,
  }));
  const byDepth = [...countBy(theirSpans, (r) => r.edgeguarderDepth).entries()].map(([depth, list]) => ({
    depth,
    total: list.length,
    kills: list.filter((r) => r.landing === "death").length,
  }));

  return {
    label,
    games: 1,
    currentGames: 1,
    habits,
    deaths: { total: deaths.length, verdicts, resourceFaults: deaths.filter((d) => d.resourceFault).length, byKiller },
    throwDI,
    whiffCapture: {
      opportunities: offered.length,
      punished: offered.filter((w) => w.punished).length,
      unpunishedByMove,
    },
    whiffExposure,
    shieldDefense: {
      graded: ownBlocks.length,
      taken: ownBlocks.filter((b) => b.grade === "punish-taken").length,
      missed: ownBlocks.filter((b) => b.grade === "punish-missed").length,
      byMove: shieldByMove,
    },
    shieldPressure: {
      graded: theirBlocks.length,
      unsafe: theirBlocks.filter((b) => b.grade === "punish-taken" || b.grade === "punish-missed").length,
      punished: theirBlocks.filter((b) => b.grade === "punish-taken").length,
    },
    recovery: {
      spans: ownSpans.length,
      died: ownSpans.filter((r) => r.landing === "death").length,
      routes,
      djEarly: ownSpans.filter((r) => r.djEarly).length,
      djEarlyDied: ownSpans.filter((r) => r.djEarly && r.landing === "death").length,
    },
    edgeguard: {
      opportunities: theirSpans.length,
      kills: theirSpans.filter((r) => r.landing === "death").length,
      byDepth,
    },
  };
}

function mergeBy<T>(lists: T[][], key: (t: T) => string, add: (a: T, b: T) => T): T[] {
  const out = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      const k = key(item);
      const prev = out.get(k);
      out.set(k, prev ? add(prev, item) : { ...item });
    }
  }
  return [...out.values()];
}

/** Sum several single-game PatternData (a set) into one column. */
export function mergePatternData(parts: PatternData[], label: string): PatternData | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return { ...parts[0]!, label };
  const sum = (f: (p: PatternData) => number) => parts.reduce((s, p) => s + f(p), 0);
  const verdicts: Record<string, number> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.deaths.verdicts)) verdicts[k] = (verdicts[k] ?? 0) + v;

  return {
    label,
    games: sum((p) => p.games),
    currentGames: sum((p) => p.currentGames),
    habits: mergeBy(
      parts.map((p) => p.habits),
      (h) => `${h.situation}\u0000${h.option}`,
      (a, b) => ({
        ...a,
        total: a.total + b.total,
        punishedOf: a.punishedOf + b.punishedOf,
        punished: a.punished + b.punished,
      }),
    ),
    deaths: {
      total: sum((p) => p.deaths.total),
      verdicts,
      resourceFaults: sum((p) => p.deaths.resourceFaults),
      byKiller: mergeBy(
        parts.map((p) => p.deaths.byKiller),
        (k) => k.move,
        (a, b) => ({
          move: a.move,
          count: a.count + b.count,
          avgPercent:
            a.avgPercent != null && b.avgPercent != null
              ? Math.round((a.avgPercent * a.count + b.avgPercent * b.count) / (a.count + b.count))
              : (a.avgPercent ?? b.avgPercent),
          noDI: a.noDI + b.noDI,
          wrongDI: a.wrongDI + b.wrongDI,
          helpfulDI: a.helpfulDI + b.helpfulDI,
          failedRecovery: a.failedRecovery + b.failedRecovery,
        }),
      ).sort((a, b) => b.count - a.count),
    },
    throwDI: mergeBy(
      parts.map((p) => p.throwDI),
      (t) => t.direction,
      (a, b) => ({ direction: a.direction, total: a.total + b.total, noDI: a.noDI + b.noDI }),
    ),
    whiffCapture: {
      opportunities: sum((p) => p.whiffCapture.opportunities),
      punished: sum((p) => p.whiffCapture.punished),
      unpunishedByMove: mergeBy(
        parts.map((p) => p.whiffCapture.unpunishedByMove),
        (m) => m.move,
        (a, b) => ({ move: a.move, count: a.count + b.count }),
      ).sort((a, b) => b.count - a.count),
    },
    whiffExposure: mergeBy(
      parts.map((p) => p.whiffExposure),
      (w) => w.move,
      (a, b) => ({ move: a.move, opportunities: a.opportunities + b.opportunities, punished: a.punished + b.punished }),
    ),
    shieldDefense: {
      graded: sum((p) => p.shieldDefense.graded),
      taken: sum((p) => p.shieldDefense.taken),
      missed: sum((p) => p.shieldDefense.missed),
      byMove: mergeBy(
        parts.map((p) => p.shieldDefense.byMove),
        (m) => m.move,
        (a, b) => ({
          move: a.move,
          graded: a.graded + b.graded,
          taken: a.taken + b.taken,
          missed: a.missed + b.missed,
        }),
      ),
    },
    shieldPressure: {
      graded: sum((p) => p.shieldPressure.graded),
      unsafe: sum((p) => p.shieldPressure.unsafe),
      punished: sum((p) => p.shieldPressure.punished),
    },
    recovery: {
      spans: sum((p) => p.recovery.spans),
      died: sum((p) => p.recovery.died),
      routes: mergeBy(
        parts.map((p) => p.recovery.routes),
        (r) => r.route,
        (a, b) => ({ route: a.route, total: a.total + b.total, died: a.died + b.died }),
      ),
      djEarly: sum((p) => p.recovery.djEarly),
      djEarlyDied: sum((p) => p.recovery.djEarlyDied),
    },
    edgeguard: {
      opportunities: sum((p) => p.edgeguard.opportunities),
      kills: sum((p) => p.edgeguard.kills),
      byDepth: mergeBy(
        parts.map((p) => p.edgeguard.byDepth),
        (d) => d.depth,
        (a, b) => ({ depth: a.depth, total: a.total + b.total, kills: a.kills + b.kills }),
      ),
    },
  };
}

// ── Formatting ─────────────────────────────────────────────────────────

/** Percentage-point gap that makes a this-game rate worth flagging against history. */
const GAME_DEVIATION_POINTS = 20;
/** Percentage-point gap that makes a matchup rate worth flagging against the character baseline. */
const MATCHUP_DEVIATION_POINTS = 10;
/** Minimum this-game denominator before a this-game rate is compared at all. */
const GAME_MIN_N = 4;
/** History cells below this denominator are noise ("50% of 2") and are not shown. */
const HISTORY_CELL_MIN_N = 5;

const SITUATION_LABEL: Record<string, string> = {
  ledge: "Ledge options (after grabbing ledge)",
  knockdown: "Knockdown options (tech / missed-tech getups)",
  oos: "Out-of-shield options (after shieldstun ends)",
};

const SITUATION_MIN: Record<string, number> = {
  ledge: EVENT_SAMPLE_GUARDS.habitSituationMin,
  knockdown: EVENT_SAMPLE_GUARDS.habitSituationMin,
  oos: EVENT_SAMPLE_GUARDS.habitSituationMin,
};

const VERDICT_TEXT: Record<string, string> = {
  NO_DI: "no DI input",
  WRONG_DI: "DI with no survival benefit",
  OK_DI: "partial survival DI",
  GOOD_DI: "good survival DI",
  FAILED_RECOVERY: "not hit again, didn't make it back",
  SD: "no opponent hit (self-destruct or ledge-occupancy edgeguard)",
  UNKNOWN: "unreadable",
};

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

/** "31% of 210" / "4/6 (67%)" — raw fraction for a single game, rate for history. */
function rate(n: number, d: number, single: boolean): string {
  if (d === 0) return "n/a";
  return single ? `${n}/${d} (${pct(n, d)}%)` : `${pct(n, d)}% of ${d}`;
}

interface Column {
  data: PatternData;
  single: boolean;
}

/**
 * Render one rate across the available columns, flagging this-game deviations
 * from history and matchup deviations from the character baseline.
 */
function compareRate(
  columns: Column[],
  pick: (d: PatternData) => { n: number; d: number } | null,
  minHistoryN: number,
): { text: string; flags: string[] } | null {
  const parts: string[] = [];
  const flags: string[] = [];
  let gameRate: number | null = null;
  let gameN = 0;
  let matchupRate: number | null = null;
  let charRate: number | null = null;
  // Flag wording names the columns, so the same block reads correctly for
  // "vs Fox" vs "all Marth" and for "last 30 games" vs "all games".
  let matchupLabel = "matchup";
  let charLabel = "character baseline";

  for (const col of columns) {
    const v = pick(col.data);
    if (!v || v.d === 0) continue;
    if (!col.single && v.d < HISTORY_CELL_MIN_N) continue;
    const r = pct(v.n, v.d)!;
    const lowN = !col.single && v.d < minHistoryN ? ", low n" : "";
    parts.push(`${col.data.label} ${rate(v.n, v.d, col.single)}${lowN}`);
    if (col.single) {
      gameRate = r;
      gameN = v.d;
    } else if (v.d >= minHistoryN) {
      if (matchupRate == null && col !== columns[columns.length - 1]) {
        matchupRate = r;
        matchupLabel = col.data.label;
      } else {
        charRate = r;
        charLabel = col.data.label;
      }
    }
  }
  if (parts.length === 0) return null;

  const usual = matchupRate ?? charRate;
  if (gameRate != null && usual != null && gameN >= GAME_MIN_N && Math.abs(gameRate - usual) >= GAME_DEVIATION_POINTS) {
    flags.push(`this game ${gameRate > usual ? "+" : ""}${gameRate - usual} pts vs usual`);
  }
  if (matchupRate != null && charRate != null && Math.abs(matchupRate - charRate) >= MATCHUP_DEVIATION_POINTS) {
    flags.push(`${matchupLabel} ${matchupRate > charRate ? "+" : ""}${matchupRate - charRate} pts vs ${charLabel}`);
  }
  return { text: parts.join(" · "), flags };
}

function line(label: string, cmp: { text: string; flags: string[] } | null): string | null {
  if (!cmp) return null;
  return `  ${label}: ${cmp.text}${cmp.flags.length > 0 ? `  ◄ ${cmp.flags.join("; ")}` : ""}`;
}

function habitSection(columns: Column[], situation: string): string[] {
  const out: string[] = [];
  const situationTotal = (d: PatternData) =>
    d.habits.filter((h) => h.situation === situation).reduce((s, h) => s + h.total, 0);
  const minN = SITUATION_MIN[situation] ?? EVENT_SAMPLE_GUARDS.habitSituationMin;

  // Options ranked by the broadest history column, plus anything this game used.
  const ranking = new Map<string, number>();
  for (const col of columns) {
    for (const h of col.data.habits.filter((x) => x.situation === situation)) {
      ranking.set(h.option, Math.max(ranking.get(h.option) ?? 0, col.single ? 0.5 : h.total));
    }
  }
  const options = [...ranking.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([o]) => o);
  if (options.length === 0) return out;

  out.push(
    `${SITUATION_LABEL[situation] ?? situation} — share of choices, then how often it got punished (hit or grabbed during the option or within 20 frames after it ended):`,
  );
  for (const option of options) {
    const find = (d: PatternData) => d.habits.find((h) => h.situation === situation && h.option === option);
    const share = compareRate(
      columns,
      (d) => {
        const total = situationTotal(d);
        return total > 0 ? { n: find(d)?.total ?? 0, d: total } : null;
      },
      minN,
    );
    const punished = compareRate(
      columns,
      (d) => {
        const h = find(d);
        return h && h.punishedOf > 0 ? { n: h.punished, d: h.punishedOf } : null;
      },
      EVENT_SAMPLE_GUARDS.habitPunishedRateMin,
    );
    const l = line(`${option} — share`, share);
    if (l) out.push(l);
    const p = line(`${option} — punished`, punished);
    if (p) out.push(`  ${p}`);
  }
  return out;
}

function deathSection(columns: Column[]): string[] {
  const out: string[] = [];
  const any = columns.some((c) => c.data.deaths.total > 0);
  if (!any) return out;
  out.push("How stocks were lost (DI read from the stick on the final hit's last hitlag frame):");
  for (const verdict of ["NO_DI", "WRONG_DI", "FAILED_RECOVERY", "GOOD_DI", "SD"]) {
    const l = line(
      VERDICT_TEXT[verdict] ?? verdict,
      compareRate(
        columns,
        (d) => (d.deaths.total > 0 ? { n: d.deaths.verdicts[verdict] ?? 0, d: d.deaths.total } : null),
        EVENT_SAMPLE_GUARDS.deathVerdictMin,
      ),
    );
    if (l) out.push(l);
  }
  const rf = line(
    "fell to death offstage with double jump unspent",
    compareRate(
      columns,
      (d) => (d.deaths.total > 0 ? { n: d.deaths.resourceFaults, d: d.deaths.total } : null),
      EVENT_SAMPLE_GUARDS.deathVerdictMin,
    ),
  );
  if (rf) out.push(rf);

  const broad = columns.filter((c) => !c.single).at(-1)?.data ?? columns[0]!.data;
  const killers = broad.deaths.byKiller.filter((k) => k.count >= EVENT_SAMPLE_GUARDS.killerMoveMin).slice(0, 4);
  if (killers.length > 0) {
    out.push(
      `  Most common finishing hits (${broad.label}): ` +
        killers
          .map(
            (k) =>
              `${k.move} x${k.count}${k.avgPercent != null ? ` (avg death ${k.avgPercent}%)` : ""} — no DI ${k.noDI}, no-benefit DI ${k.wrongDI}, helpful DI ${k.helpfulDI}${k.failedRecovery > 0 ? `, didn't make it back ${k.failedRecovery}` : ""}`,
          )
          .join("; "),
    );
  }
  return out;
}

/**
 * The cross-game block. Columns: this game (optional), matchup history
 * (optional), character history. Returns [] when there is no history at all.
 */
export function formatRecurringPatterns(
  patterns: RecurringPatterns | null | undefined,
  thisGame?: PatternData | null,
): string[] {
  const history = [patterns?.matchup, patterns?.character].filter((d): d is PatternData => d != null && d.games > 0);
  if (history.length === 0 && !thisGame) return [];
  const columns: Column[] = [
    ...(thisGame ? [{ data: thisGame, single: true }] : []),
    ...history.map((data) => ({ data, single: false })),
  ];
  // Broadest column, for the "most often" detail lines.
  const broad = history.at(-1) ?? thisGame!;

  const lines: string[] = [];
  if (history.length > 0) {
    const scope = history.map((h) => `${h.label} = ${h.games} games`).join("; ");
    const current = history.map((h) => `${h.label} ${h.currentGames}`).join(", ");
    lines.push(
      history.every((h) => h.currentGames === 0)
        ? `Scope: ${scope}. None of these games were parsed with the current death-verdict and punish detectors yet, so history for those lines is omitted — do not infer it.`
        : `Scope: ${scope}. Death verdicts and punish rates use only games parsed with the current detectors (${current}).`,
    );
    lines.push(
      `Each line reads: ${columns.map((c) => c.data.label).join(" · ")}. ◄ marks a gap large enough to matter; 'low n' means too few samples to call a habit.`,
    );
  } else {
    lines.push("No stored history for this player yet — everything below is one sample, not an established habit.");
  }
  lines.push("");

  for (const situation of ["ledge", "knockdown", "oos"]) {
    const s = habitSection(columns, situation);
    if (s.length > 0) lines.push(...s, "");
  }

  const d = deathSection(columns);
  if (d.length > 0) lines.push(...d, "");

  // Throw DI received, per throw direction.
  const directions = new Set(columns.flatMap((c) => c.data.throwDI.map((t) => t.direction)));
  if (directions.size > 0) {
    lines.push("Throw DI when you were thrown (no DI = stick in the deadzone at release):");
    for (const dir of ["down", "up", "forward", "back"].filter((x) => directions.has(x))) {
      const l = line(
        `${dir}-throw, no DI`,
        compareRate(
          columns,
          (p) => {
            const t = p.throwDI.find((x) => x.direction === dir);
            return t ? { n: t.noDI, d: t.total } : null;
          },
          EVENT_SAMPLE_GUARDS.throwDirectionMin,
        ),
      );
      if (l) lines.push(l);
    }
    lines.push("");
  }

  // Whiff ledger.
  const capture = line(
    "Opponent whiffed in range while you could act — you punished",
    compareRate(
      columns,
      (p) => ({ n: p.whiffCapture.punished, d: p.whiffCapture.opportunities }),
      EVENT_SAMPLE_GUARDS.whiffCaptureMin,
    ),
  );
  if (capture) {
    lines.push("Free punishes (whiff ledger; combo-filler and offstage recovery specials excluded):", capture);

    const left = broad.whiffCapture.unpunishedByMove.slice(0, 3);
    if (left.length > 0) {
      lines.push(
        `  Their whiffs most often left unpunished (${broad.label}): ${left.map((m) => `${m.move} x${m.count}`).join(", ")}`,
      );
    }
    const exposed = [...broad.whiffExposure]
      .filter((w) => w.opportunities >= EVENT_SAMPLE_GUARDS.shieldMoveMin)
      .sort((a, b) => b.punished / b.opportunities - a.punished / a.opportunities)
      .slice(0, 3);
    if (exposed.length > 0) {
      lines.push(
        `  Your punishable whiffs that got punished (${broad.label}): ${exposed.map((w) => `${w.move} ${rate(w.punished, w.opportunities, false)}`).join(", ")}`,
      );
    }
    lines.push("");
  }

  // Shield.
  const shield = line(
    "You took the punish",
    compareRate(
      columns,
      (p) => ({ n: p.shieldDefense.taken, d: p.shieldDefense.taken + p.shieldDefense.missed }),
      EVENT_SAMPLE_GUARDS.shieldGradeMin,
    ),
  );
  if (shield) {
    lines.push(
      "Shield defense — final block of a string where you were actionable ≥8 frames before the attacker, who was grounded within estimated grab distance:",
      shield,
    );

    const worst = broad.shieldDefense.byMove
      .filter((m) => m.taken + m.missed >= EVENT_SAMPLE_GUARDS.shieldMoveMin)
      .sort((a, b) => b.missed - a.missed)
      .slice(0, 3);
    if (worst.length > 0) {
      lines.push(
        `  Most missed after blocking (${broad.label}): ${worst.map((m) => `${m.move} — missed ${m.missed} of ${m.taken + m.missed}`).join("; ")}`,
      );
    }
    const pressure = line(
      "Your pressure left them that same punish window",
      compareRate(
        columns,
        (p) => ({ n: p.shieldPressure.unsafe, d: p.shieldPressure.graded }),
        EVENT_SAMPLE_GUARDS.shieldGradeMin,
      ),
    );
    if (pressure) lines.push(pressure);
    lines.push("");
  }

  // Recovery + edgeguards.
  const rec = line(
    "Your recoveries ending in death",
    compareRate(columns, (p) => ({ n: p.recovery.died, d: p.recovery.spans }), EVENT_SAMPLE_GUARDS.recoveryRouteMin),
  );
  if (rec) {
    lines.push("Recovery (offstage spans; depth × outcome numbers are descriptive, not causal):", rec);
    for (const route of ["high", "mid", "low"]) {
      const l = line(
        `${route} route — died`,
        compareRate(
          columns,
          (p) => {
            const r = p.recovery.routes.find((x) => x.route === route);
            return r ? { n: r.died, d: r.total } : null;
          },
          EVENT_SAMPLE_GUARDS.recoveryRouteMin,
        ),
      );
      if (l) lines.push(l);
    }
    const eg = line(
      "Opponent recoveries you killed (your edgeguarding)",
      compareRate(
        columns,
        (p) => ({ n: p.edgeguard.kills, d: p.edgeguard.opportunities }),
        EVENT_SAMPLE_GUARDS.recoveryRouteMin,
      ),
    );
    if (eg) lines.push(eg);
    for (const depth of ["onstage", "ledge", "shallow", "deep"]) {
      const l = line(
        `kills when your deepest commitment was ${depth}`,
        compareRate(
          columns,
          (p) => {
            const r = p.edgeguard.byDepth.find((x) => x.depth === depth);
            return r ? { n: r.kills, d: r.total } : null;
          },
          EVENT_SAMPLE_GUARDS.edgeguardCellMin,
        ),
      );
      if (l) lines.push(l);
    }
  }

  while (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Compact one-line-per-scope comparison for the career prompt (one row per
 * matchup or per character). Each cell is the same rate the main block shows,
 * under the same sample guards: a cell below its guard prints the raw fraction
 * marked "low n", and a row with nothing measurable is omitted.
 */
export function formatPatternBreakdown(rows: PatternData[]): string[] {
  const out: string[] = [];
  const cell = (n: number, d: number, min: number): string | null => {
    if (d === 0) return null;
    return d < min ? `${n}/${d} (low n)` : `${pct(n, d)}% of ${d}`;
  };
  for (const p of rows) {
    const parts: string[] = [];
    const punishedOf = p.habits.reduce((s, h) => s + h.punishedOf, 0);
    const punished = p.habits.reduce((s, h) => s + h.punished, 0);
    const habitCell = cell(punished, punishedOf, EVENT_SAMPLE_GUARDS.habitSituationMin);
    if (habitCell) parts.push(`ledge/knockdown/OOS options punished ${habitCell}`);
    const noDI = cell(p.deaths.verdicts.NO_DI ?? 0, p.deaths.total, EVENT_SAMPLE_GUARDS.deathVerdictMin);
    if (noDI) parts.push(`deaths with no DI input ${noDI}`);
    const capture = cell(p.whiffCapture.punished, p.whiffCapture.opportunities, EVENT_SAMPLE_GUARDS.whiffCaptureMin);
    if (capture) parts.push(`their punishable whiffs you punished ${capture}`);
    const shield = cell(
      p.shieldDefense.taken,
      p.shieldDefense.taken + p.shieldDefense.missed,
      EVENT_SAMPLE_GUARDS.shieldGradeMin,
    );
    if (shield) parts.push(`shield punish windows you took ${shield}`);
    const recovery = cell(p.recovery.died, p.recovery.spans, EVENT_SAMPLE_GUARDS.recoveryRouteMin);
    if (recovery) parts.push(`your recoveries ending in death ${recovery}`);
    const edgeguard = cell(p.edgeguard.kills, p.edgeguard.opportunities, EVENT_SAMPLE_GUARDS.recoveryRouteMin);
    if (edgeguard) parts.push(`their recoveries you killed ${edgeguard}`);
    if (parts.length === 0) continue;
    out.push(`  ${p.label} (${p.games} games): ${parts.join("; ")}`);
  }
  return out;
}
