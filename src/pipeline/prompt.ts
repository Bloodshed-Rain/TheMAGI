import type { GameResult, PlayerHistory, PlayerSummary, HabitProfile, GameFrameEvents, PlayerSlot } from "./types.js";
import { computeAdaptationSignals, findPlayerIdx } from "./adaptation.js";
import { moveIdToName, getMoveName, frameToTimestamp } from "./helpers.js";
import {
  formatRecurringPatterns,
  mergePatternData,
  patternsFromFrameEvents,
  type PatternData,
  type RecurringPatterns,
} from "./patterns.js";

// ── Measured DI prompt section ────────────────────────────────────────

/** Throw-DI sector labels; +x is normalized to the thrower's facing. */
const THROW_SECTOR_LABELS = [
  "forward",
  "forward-up",
  "up",
  "back-up",
  "back",
  "back-down",
  "down",
  "forward-down",
] as const;

/**
 * Compact per-game measured-DI block: death verdicts read from actual stick
 * inputs plus a throw-DI summary. Empty array when there is nothing to say.
 */
function formatMeasuredDISection(frameEvents: GameFrameEvents, tagBySlot: [string, string]): string[] {
  const lines: string[] = [];

  for (const slot of [0, 1] as PlayerSlot[]) {
    const deaths = frameEvents.stocks.filter((s) => s.victimSlot === slot && s.died && s.verdict != null);
    const deathParts = deaths.map((s) => {
      const hit =
        s.killerMoveId != null
          ? `final hit ${moveIdToName[s.killerMoveId] ?? getMoveName(s.killerMoveId)}`
          : "no opponent hit credited";
      const dir =
        s.deathDirection === "up"
          ? " off the top"
          : s.deathDirection === "down"
            ? " off the bottom"
            : s.deathDirection
              ? ` off the ${s.deathDirection} side`
              : "";
      const verdict =
        s.verdict === "NO_DI"
          ? "no DI input"
          : s.verdict === "WRONG_DI"
            ? `DI with no survival benefit (score ${s.diScore ?? 0})`
            : s.verdict === "OK_DI"
              ? `partial survival DI (score ${s.diScore ?? 0})`
              : s.verdict === "GOOD_DI"
                ? `good survival DI (score ${s.diScore ?? 0})`
                : s.verdict === "FAILED_RECOVERY"
                  ? "not hit again after that — didn't make it back (no DI graded)"
                  : s.verdict === "SD"
                    ? "self-destruct or ledge-occupancy edgeguard"
                    : "DI unreadable";
      const fault = s.resourceFault ? ", fell with double jump unspent" : "";
      const ts = s.endFrame != null ? ` [${frameToTimestamp(s.endFrame)}]` : "";
      return `died at ${Math.round(s.deathPercent ?? 0)}%${dir}, ${hit} — ${verdict}${fault}${ts}`;
    });
    if (deathParts.length > 0) {
      lines.push(`${tagBySlot[slot]} deaths: ${deathParts.join("; ")}`);
    }

    const throws = frameEvents.throwDI.filter((t) => t.victimSlot === slot);
    if (throws.length > 0) {
      const byDirection = new Map<string, { total: number; noDI: number; sectors: Map<number, number> }>();
      for (const t of throws) {
        const entry = byDirection.get(t.throwDirection) ?? { total: 0, noDI: 0, sectors: new Map() };
        entry.total++;
        if (t.noDI) entry.noDI++;
        else entry.sectors.set(t.sector, (entry.sectors.get(t.sector) ?? 0) + 1);
        byDirection.set(t.throwDirection, entry);
      }
      const parts = [...byDirection.entries()].map(([direction, e]) => {
        const topSector = [...e.sectors.entries()].sort((a, b) => b[1] - a[1])[0];
        const sectorText = topSector ? `, mostly ${THROW_SECTOR_LABELS[topSector[0]] ?? "?"} (${topSector[1]})` : "";
        const noDIText = e.noDI > 0 ? `, no-DI ${e.noDI}/${e.total}` : "";
        return `${direction}-throw x${e.total}${noDIText}${sectorText}`;
      });
      lines.push(`${tagBySlot[slot]} throw DI received: ${parts.join("; ")}`);
    }
  }

  return lines;
}

/**
 * Compact per-game recovery + edgeguard commitment block. Sample sizes are
 * always shown — the depth × kill numbers are descriptive, not causal.
 */
function formatRecoverySection(frameEvents: GameFrameEvents, tagBySlot: [string, string]): string[] {
  const lines: string[] = [];

  for (const slot of [0, 1] as PlayerSlot[]) {
    const mine = frameEvents.recoverySpans.filter((r) => r.playerSlot === slot);
    if (mine.length > 0) {
      const count = (fn: (r: (typeof mine)[number]) => boolean): number => mine.filter(fn).length;
      const deaths = count((r) => r.landing === "death");
      const routes = ["high", "mid", "low"]
        .map((route) => {
          const n = count((r) => r.route === route);
          const died = count((r) => r.route === route && r.landing === "death");
          return n > 0 ? `${route} ${n}${died > 0 ? ` (${died} died)` : ""}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const djUsed = mine.filter((r) => r.djFrame != null);
      const djEarly = djUsed.filter((r) => r.djEarly).length;
      const contestedDeaths = count((r) => r.contested && r.landing === "death");

      // Up-B timing variance per launch bucket: metronomic = interceptable.
      const byQuadrant = new Map<string, number[]>();
      for (const r of mine) {
        if (r.upbDelay != null) {
          const list = byQuadrant.get(r.launchQuadrant) ?? [];
          list.push(r.upbDelay);
          byQuadrant.set(r.launchQuadrant, list);
        }
      }
      let timingNote = "";
      for (const [quadrant, delays] of byQuadrant) {
        if (delays.length >= 3) {
          const mean = delays.reduce((s, d) => s + d, 0) / delays.length;
          const sd = Math.sqrt(delays.reduce((s, d) => s + (d - mean) ** 2, 0) / delays.length);
          if (sd < 3) {
            timingNote = `; up-B timing from ${quadrant} is METRONOMIC (σ=${Math.round(sd * 10) / 10}f over ${delays.length} — interceptable on a timer)`;
            break;
          }
        }
      }

      lines.push(
        `${tagBySlot[slot]} recoveries: ${mine.length} — landings: ledge ${count((r) => r.landing === "ledge")}, stage ${count((r) => r.landing === "stage")}, died ${deaths}` +
          (routes ? `; routes: ${routes}` : "") +
          (djUsed.length > 0 ? `; DJ burned early ${djEarly}/${djUsed.length}` : "") +
          (contestedDeaths > 0 ? `; ${contestedDeaths} deaths came while contested` : "") +
          timingNote,
      );
    }

    // Edgeguard side: this player guarding the OTHER player's recoveries.
    const theirs = frameEvents.recoverySpans.filter((r) => r.playerSlot !== slot);
    if (theirs.length > 0) {
      const cells = (["onstage", "ledge", "shallow", "deep"] as const)
        .map((depth) => {
          const n = theirs.filter((r) => r.edgeguarderDepth === depth).length;
          const kills = theirs.filter((r) => r.edgeguarderDepth === depth && r.landing === "death").length;
          return n > 0 ? `${depth} ${kills}/${n}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const invincible = theirs.filter((r) => r.edgeguarderInvincibleLedgeFrames > 0).length;
      lines.push(
        `${tagBySlot[slot]} edgeguarding (kills/attempts by deepest commitment — small samples, descriptive only): ${cells}` +
          (invincible > 0 ? `; used invincible ledge-hold in ${invincible}` : ""),
      );
    }
  }

  return lines;
}

/**
 * Compact per-game whiff-punish ledger: opportunities offered vs captured
 * (capture side) and own whiffs punished (exposure side).
 */
function formatWhiffSection(frameEvents: GameFrameEvents, tagBySlot: [string, string]): string[] {
  const lines: string[] = [];

  for (const slot of [0, 1] as PlayerSlot[]) {
    // Capture side: the OPPONENT's whiffs are this player's opportunities.
    const offered = frameEvents.whiffs.filter((w) => w.whifferSlot !== slot && w.opportunity);
    if (offered.length >= 2) {
      const captured = offered.filter((w) => w.punished);
      const ignored = offered.filter((w) => !w.punished);
      const byMove = new Map<string, number>();
      for (const w of ignored) byMove.set(w.attackLabel, (byMove.get(w.attackLabel) ?? 0) + 1);
      const ignoredText = [...byMove.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, n]) => `${label} x${n}`)
        .join(", ");
      const delays = captured.map((w) => w.reactionDelay).filter((d): d is number => d != null);
      const medianDelay = delays.length > 0 ? delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;
      lines.push(
        `${tagBySlot[slot]}: given ${offered.length} free-punish windows (opponent whiffed in range with time to act) — captured ${captured.length}` +
          (ignored.length > 0 ? `; left on the table: ${ignoredText}` : "") +
          (medianDelay != null ? `; median reaction on captures ${medianDelay}f` : ""),
      );
    }

    // Exposure side: this player's own whiffs inside punish range.
    const exposed = frameEvents.whiffs.filter((w) => w.whifferSlot === slot && w.opportunity);
    if (exposed.length >= 2) {
      const paid = exposed.filter((w) => w.punished).length;
      const byMove = new Map<string, number>();
      for (const w of exposed) byMove.set(w.attackLabel, (byMove.get(w.attackLabel) ?? 0) + 1);
      const topMove = [...byMove.entries()].sort((a, b) => b[1] - a[1])[0];
      lines.push(
        `${tagBySlot[slot]} exposure: whiffed punishably ${exposed.length}x, punished ${paid}x` +
          (topMove ? ` (most exposed move: ${topMove[0]} x${topMove[1]})` : ""),
      );
    }
  }

  return lines;
}

/**
 * Compact per-game shield frame-gap audit: measured gaps + graded OOS
 * decisions per blocked move (defense), and pressure-gap quality (offense).
 */
function formatShieldSection(frameEvents: GameFrameEvents, tagBySlot: [string, string]): string[] {
  const lines: string[] = [];

  for (const slot of [0, 1] as PlayerSlot[]) {
    const blocks = frameEvents.shieldBlocks.filter((b) => b.defenderSlot === slot);
    if (blocks.length === 0) continue;

    const finals = blocks.filter((b) => b.stringFinal && b.frameGap != null);
    const taken = finals.filter((b) => b.grade === "punish-taken").length;
    const missed = finals.filter((b) => b.grade === "punish-missed").length;
    const unsafe = finals.filter((b) => b.grade === "unsafe-challenge").length;
    const holds = finals.filter((b) => b.grade === "correct-hold").length;

    // Per-move rollup, worst offenders first (by missed punishes then count).
    const byMove = new Map<string, { n: number; gaps: number[]; missed: number; taken: number }>();
    for (const b of finals) {
      const e = byMove.get(b.attackLabel) ?? { n: 0, gaps: [], missed: 0, taken: 0 };
      e.n++;
      if (b.frameGap != null) e.gaps.push(b.frameGap);
      if (b.grade === "punish-missed") e.missed++;
      if (b.grade === "punish-taken") e.taken++;
      byMove.set(b.attackLabel, e);
    }
    const moveText = [...byMove.entries()]
      .sort((a, b) => b[1].missed - a[1].missed || b[1].n - a[1].n)
      .slice(0, 3)
      .map(([label, e]) => {
        const avgGap =
          e.gaps.length > 0 ? Math.round((e.gaps.reduce((s, g) => s + g, 0) / e.gaps.length) * 10) / 10 : 0;
        return `${label} x${e.n} (avg gap ${avgGap >= 0 ? "+" : ""}${avgGap}f${e.missed > 0 ? `, ${e.missed} punish windows not taken` : ""}${e.taken > 0 ? `, took ${e.taken}` : ""})`;
      })
      .join("; ");

    lines.push(
      `${tagBySlot[slot]} on shield: ${blocks.length} blocks in ${new Set(blocks.map((b) => b.stringId)).size} strings — punish windows (≥8f advantage, attacker grounded within est. grab range) taken ${taken}, not taken ${missed}; unsafe challenges ${unsafe}; correct holds ${holds}` +
        (moveText ? `. By move blocked: ${moveText}` : ""),
    );

    // Offense mirror: this player's pressure = the opponent's graded final blocks.
    const oppFinals = frameEvents.shieldBlocks.filter(
      (b) => b.defenderSlot !== slot && b.stringFinal && b.frameGap != null,
    );
    if (oppFinals.length >= 3) {
      const windows = oppFinals.filter((b) => b.grade === "punish-taken" || b.grade === "punish-missed").length;
      const punished = oppFinals.filter((b) => b.grade === "punish-taken").length;
      lines.push(
        `${tagBySlot[slot]} shield pressure safety: of ${oppFinals.length} strings ended on the opponent's shield, ${windows} left them a ≥8f in-range punish window${windows > 0 ? `; they took ${punished}` : ""}`,
      );
    }
  }

  return lines;
}
// ── System prompt ─────────────────────────────────────────────────────

/** Definition discipline shared by the game/set and aggregate coaching prompts. */
// prettier-ignore
const COACHING_EVIDENCE_RULES = `EVIDENCE RULES
- Every rate carries its denominator: "rolled from ledge 31 of 120 times vs Fox", not "rolls a lot".
- Correlation is not cause. Recovery-route and edgeguard-commitment outcome numbers are descriptive; say what happened, not why.
- Use each block's stated definition and do not upgrade it. A shield punish window is "actionable at least 8 frames before the attacker, who was grounded within estimated grab distance" — call it a window, not a guaranteed punish you always must take. A "didn't make it back" death had no final hit to grade DI on — it is neither a DI mistake nor a self-destruct. A "no opponent hit" death may be a ledge-occupancy edgeguard. "DI with no survival benefit" means the stick was close to parallel to the launch (or, for side kills, on the downward side) — not "DI'd into the blast zone". A low-yield opening only says little damage followed; it does not prove a bigger punish existed. If you propose a better punish route, label it your matchup judgment.
- Frame data, matchup facts and character tech that are not in the data must be well-established; otherwise say it is your read. No generic matchup advice that is not tied to an observed pattern.
- Distinguish decision problems (predictable options, wrong option for the situation) from execution problems (dropped inputs). They need different practice.

CHARACTER SIGNATURE STATS
signatureStats fields count observed hit sequences in conversion move lists, not input-verified techniques. Use them only as supporting evidence.
- Fox: multiShineCombos = conversions with at least two shine hits; it does not establish multishine or waveshine inputs. waveshineToUpsmash = shine immediately followed by an upsmash hit; no wavedash is verified. Describe only the observed sequence. laserCount = lasers fired (projectile records).
- Falco: pillarCombos = dair→shine→dair hit sequences. shineGrabs = shine immediately followed by a pummel or throw. laserCount = lasers fired.
- Marth: kenCombos = FAIR→FAIR→DAIR finishing sequence whose final DAIR takes the stock (one stat only). fsmashKills counts all forward-smash kills; replay data does not distinguish tipper from sourspot. chainGrabs = two or more throws in one conversion.
- Peach: floatAerials = aerials started while floating; floatCancelAerials = float aerials that landed mid-animation.
- "*SpikeKills" and shineSpikeKills require the final hit to land with the victim offstage and the death to go off the bottom (spikes) or not off the top (shine spike). Other "*Kills" fields only say which move was the final hit.
- Fields named "*Count" for special moves (missileCount, fireBallCount, pillCount, capeCount, counterCount…) count hits that connected, not uses, except the laser counts above.
- Other characters: the field name describes the counted hit sequence; treat it the same way.`;

// prettier-ignore
export const SYSTEM_PROMPT = `You are MAGI, a Super Smash Bros. Melee coach reviewing measured replay data for one player.

The player has already seen the result, the stocks, the percents and the Slippi stats screen. Repeating any of that is worthless to them. Your job is to tell them something they do NOT already know that changes how they play their next set.

WHAT COUNTS AS A FINDING
A finding must pass all three tests:
1. It is not a restatement of an outcome or a headline number (who won, stock count, neutral win %, openings per kill, damage per opening, L-cancel %, "you died at 130% to upsmash"). Those are evidence, never findings.
2. It names a specific behavior in a specific situation, measured in the data, with its count and denominator. Strongest when it recurs in the player's history (RECURRING PATTERNS) and shows up in this game.
3. It states the cost (what the opponent can do about it, or what it cost here) and one concrete replacement: what to do instead, in which situation, and the cue that tells the player they are in that situation.

Where findings come from, best first:
- Gaps marked ◄ in RECURRING PATTERNS: this game far from the player's norm, or the matchup far from their character baseline.
- Measured decisions: ledge, knockdown and out-of-shield option shares and how often each got punished; DI on the final hit of each death, read from the stick; throw DI; free punishes taken vs left; shield punish windows taken vs missed; recovery route outcomes; edgeguard outcomes.
- Opponent behavior that repeated within this game or set and can be exploited next game.
Execution stats (L-cancels, wavedash counts, signature-move counts) only matter when they explain a decision-level problem. If execution data is strong, do not spend words on it.

SCOPE: THIS GAME (OR THIS SET)
- Every finding is something that happened in the game or set under review, with its count here and the timestamps that support it. Rank findings by what they cost here.
- The player's history (RECURRING PATTERNS, the matchup record) decides what to CALL a finding, never whether it counts. A this-game pattern that also recurs in history is a habit: say so with both counts, and it outranks a this-game-only pattern of equal cost. A this-game pattern with no history behind it is reported as "this game: 4 of 5 ledge options were rolls", never as a habit.
- A pattern that exists in the player's history but did not occur in this game is not a finding here. At most it is one sentence of context under a finding it explains.
- Timestamps: cite only timestamps that appear in the data, in [m:ss] form, for the moments that support a finding. Never invent one.

${COACHING_EVIDENCE_RULES}

OUTPUT FORMAT
Markdown. Use exactly these ## headings, in this order. Under ~600 words total. No preamble, no closing summary.

## The Read
2–4 sentences on what actually decided this game or set, in terms of behavior. No score recap.

## Fix This First
The single highest-impact leak, in this structure:
**Pattern:** what the player does, in what situation, with n of d (this game and history).
**Why it costs you:** what the opponent can do about it, or what it cost here (timestamp if one supports it).
**Do instead:** the replacement option, the cue for the situation, and how it changes the opponent's options.

## Also Worth Fixing
One or two more leaks in the same three-part structure. Fewer and stronger beats more and weaker. Omit the section if nothing else passes the finding tests.

## Exploit Next Game
One or two things the OPPONENT did repeatedly (ledge or tech options, DI, unsafe pressure, whiffs, recovery route) and the specific counter, with counts. Omit the section if nothing repeated.

## Keep Doing
One sentence on a measured strength worth protecting, with its number. Omit if none stands out.

## Set Analysis
Multi-game sets only: what changed between games (adaptation signals, counterpicks), who adjusted, and what to change next set. Omit for a single game.

## Practice Plan
Two or three drills, each tied to a finding above: the situation to recreate (training mode, a partner or friendlies), the response to repeat, and a target the player can check in MAGI afterwards (for example "ledge roll share vs Fox under 20%" or "take at least half of shield punish windows after nair").

TONE
A practice partner who watched the set and tells the truth. Direct and specific. Not clinical, not condescending, no hype.`;

// ── Prompt assembly ───────────────────────────────────────────────────

// ── Aggregate analysis prompts ─────────────────────────────────────────

// prettier-ignore
export const SYSTEM_PROMPT_AGGREGATE = `You are MAGI, a Super Smash Bros. Melee coach reviewing one player's games inside one scope: one character, one stage, or one opponent.

SCOPE
- CHARACTER scope = the games the player played AS that character, never games against it. STAGE scope = their games on that stage. OPPONENT scope = their games against that opponent.
- Every finding is about the player's own play inside this scope. The "all your games" column exists only to show what is specific to this scope. Never write findings about other characters, stages or opponents, and never recite the player's lifetime record.

The player can already see this scope's averages in the app. Restating them is worthless. Your job is to find what the averages hide and turn it into something they change the next time they play this character, this stage, or this opponent.

WHAT COUNTS AS A FINDING
1. It is not a restatement of an average or a record (win rate, neutral win %, openings per kill, L-cancel %). Those are evidence, never findings.
2. It names a specific behavior in a specific situation, measured in the data, with its count and denominator.
3. It states the cost and one concrete replacement: what to do instead, in which situation, and the cue that tells the player they are in it.

Where findings come from, best first:
- Lines marked ◄ in MEASURED PATTERNS: this scope far from the player's overall baseline. That gap is what is specific about this character, stage or opponent.
- Measured decisions: ledge, knockdown and out-of-shield option shares and punish rates; DI on deaths read from the stick; throw DI; free punishes taken vs left; shield punish windows taken vs missed; recovery and edgeguard outcomes.
- The aggregate stats, only to explain or size a finding.

${COACHING_EVIDENCE_RULES}

OUTPUT FORMAT
Markdown. Use exactly these ## headings, in this order. Under ~500 words total. No preamble, no closing summary.

## The Read
2–4 sentences on what defines the player's results in this scope, in terms of behavior.

## Fix This First
**Pattern:** / **Why it costs you:** / **Do instead:** — the single highest-impact leak, with n of d.

## Also Worth Fixing
One or two more leaks in the same structure. Omit if nothing else passes the finding tests.

## Keep Doing
One sentence on a measured strength worth protecting, with its number. Omit if none stands out.

## Practice Plan
Two or three drills tied to the findings, each with a target the player can check in MAGI afterwards.`;

export function assembleAggregatePrompt(
  stats: any,
  scopeType: "character" | "stage" | "opponent",
  identifier: string,
  options?: { lifetimeGames?: number | undefined },
): string {
  const lines: string[] = [];

  const scopeText =
    scopeType === "character"
      ? `the player's games playing AS ${identifier}`
      : scopeType === "stage"
        ? `the player's games on ${identifier}`
        : `the player's games against ${identifier}`;
  const games = Number(stats?.gamesPlayed ?? 0);
  const record = `${Number(stats?.wins ?? 0)}W-${Number(stats?.losses ?? 0)}L over ${games} games`;
  const lifetime = options?.lifetimeGames ?? 0;
  const share =
    lifetime > 0 ? ` (${Math.round((games / lifetime) * 100)}% of the player's ${lifetime} recorded games)` : "";
  lines.push(`Scope: ${scopeType.toUpperCase()} — ${scopeText}: ${record}${share}.`);
  lines.push("");
  lines.push("=== AGGREGATE DATA (dashboard numbers — evidence only) ===");
  lines.push(JSON.stringify(stripNulls(stats)));
  lines.push("");
  lines.push(
    "Write the coaching analysis in the format from your instructions. Measured patterns, when present, follow.",
  );

  return lines.join("\n");
}

export const SYSTEM_PROMPT_CHARACTER_BLURB = `You are MAGI helping a Melee player understand their games with one character.
Talk only about the player's games playing AS this character; never mention their other characters or lifetime record.
Write 3 short sentences in everyday language, addressed to the player as "you". No headings or markdown.
First describe one thing going well, then one thing to improve, then one small action to try next session.
Use at most two numbers, with the number of examples when useful. Explain any necessary Melee term in the sentence.
Avoid archetypes, scouting language, "leaks", "capture rate", "resource faults", "economy", and analyst jargon.
Do not claim a cause from a correlation or rank the player against other players.
Only cite stats with enough examples: habit options >=15, deaths >=20, missed-attack opportunities >=25, shield blocks >=30, recovery attempts >=20.
Never invent numbers. If there is too little evidence, say what more games could help reveal.`;

/// ── Career (all recorded games) prompt ─────────────────────────────────

/**
 * Everything the career prompt prints. Built by the analyze:career handler
 * from the DB (overview, drift, determinants) and from the pattern
 * formatters, so this module stays free of database access.
 */
export interface CareerPromptData {
  tag: string;
  overview: {
    games: number;
    wins: number;
    losses: number;
    firstPlayedAt: string | null;
    lastPlayedAt: string | null;
    characters: { character: string; games: number; wins: number; losses: number }[];
    opponentCharacters: { opponentCharacter: string; games: number; wins: number; losses: number }[];
  };
  /** Oldest-window vs newest-window per-game averages; null when the record is too short for two windows. */
  drift: { windowGames: number; rows: { label: string; early: number; recent: number; unit: "pct" | "num" }[] } | null;
  /** formatRecurringPatterns output: recent window vs all games. */
  recentVsAllLines: string[];
  /** formatPatternBreakdown output: one row per main character. */
  byCharacterLines: string[];
  /** formatPatternBreakdown output: one row per common opponent character. */
  byMatchupLines: string[];
  /** Descriptive per-game stat relationships over every decisive game (db getDeepInsightsData). */
  determinants: {
    gamesAnalyzed: number;
    wins: number;
    losses: number;
    correlations: { metricA: string; metricB: string; coefficient: number }[];
    situationalAverages: { label: string; games: number; metrics: Record<string, number> }[];
    winLossDiffs: Record<string, number>;
  } | null;
}

// prettier-ignore
export const SYSTEM_PROMPT_CAREER = `You are MAGI, a Super Smash Bros. Melee coach reviewing one player's ENTIRE recorded history: every game MAGI has imported for them, across every character they play, every opponent and every stage.

A human coach sees a few sets and remembers a few more. You are looking at all of it at once. The player can already see per-game stats, averages and trend lines in the app, so restating those is worthless. Your value is what only the full record can show:
- A decision the player keeps making whoever they play and whoever they face, with how often each matchup punishes it.
- What changed between their early games and their recent games in behavior, not just results, and what did not change despite many more games.
- What separates their wins from their losses in measured behavior, beyond "won neutral more".
- A matchup, character or situation where their numbers sit far from their own baseline, which nobody notices one game at a time.

WHAT COUNTS AS A FINDING
A finding must pass all three tests:
1. It is not a restatement of a record, an average or a trend line (win rate, neutral win %, openings per kill, L-cancel %, "improving over time"). Those are evidence, never findings.
2. It names a specific behavior in a specific situation, measured in the data, with its count and denominator, and says which scopes it holds in (which characters, which matchups, early and/or recent).
3. It states the cost and one concrete replacement: what to do instead, in which situation, and the cue that tells the player they are in it.

${COACHING_EVIDENCE_RULES}
- An early-vs-recent gap is a change in results, not proof of a change in skill: the opponents, characters and stages in the two windows can differ. Say what changed; offer a cause only as your read.
- Win-minus-loss differences and correlations are descriptive over the games listed, with no control for who the opponent was. Never present one as a cause. Cite a correlation only with its sample size, and only when it is at least moderate.
- Sample guards are already applied. A cell marked "low n" is not evidence; a block that is omitted has too few games, say so if it matters.
- Execution stats (L-cancels, wavedash counts, signature-move counts) only matter when they explain a decision-level pattern.

OUTPUT FORMAT
Markdown. Use exactly these ## headings, in this order. Under ~700 words total. No preamble, no closing summary.

## The Read
2–4 sentences on what defines this player's results across their whole record, in terms of behavior.

## Only the Full Record Shows
Two to four findings that need the whole history to see: a habit that persists across matchups or characters, an early-vs-recent change, or a win/loss separator. Each with its counts and the scopes it holds in.

## Fix This First
**Pattern:** / **Why it costs you:** / **Do instead:** — the single highest-impact leak across the record, with n of d and the matchups where it costs most.

## Also Worth Fixing
One or two more leaks in the same structure. Omit if nothing else passes the finding tests.

## Keep Doing
One or two measured strengths worth protecting, with their numbers. Omit if none stands out.

## Practice Plan
Two or three drills tied to the findings, each with a target the player can check in MAGI afterwards.`;

function fmtDriftValue(value: number, unit: "pct" | "num"): string {
  return unit === "pct" ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
}

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "unknown date";
}

export function assembleCareerPrompt(data: CareerPromptData): string {
  const o = data.overview;
  const lines: string[] = [];
  lines.push(`=== SCOPE: ALL RECORDED GAMES for ${data.tag} ===`);
  lines.push(
    `${o.games} games (${o.wins}W-${o.losses}L), from ${fmtDate(o.firstPlayedAt)} to ${fmtDate(o.lastPlayedAt)}. Every number below is over this record unless its own scope says otherwise.`,
  );
  if (o.characters.length > 0) {
    lines.push(
      `Characters played: ${o.characters.map((c) => `${c.character} ${c.games} games (${c.wins}W-${c.losses}L)`).join(", ")}`,
    );
  }
  if (o.opponentCharacters.length > 0) {
    lines.push(
      `Most common opponent characters: ${o.opponentCharacters
        .slice(0, 8)
        .map((m) => `${m.opponentCharacter} ${m.games} games (${m.wins}W-${m.losses}L)`)
        .join(", ")}`,
    );
  }

  if (data.drift && data.drift.rows.length > 0) {
    lines.push(
      "",
      `=== EARLY vs RECENT — per-game averages over the oldest ${data.drift.windowGames} games vs the newest ${data.drift.windowGames} (opponents and characters may differ between windows) ===`,
    );
    for (const r of data.drift.rows) {
      lines.push(`  ${r.label}: early ${fmtDriftValue(r.early, r.unit)} → recent ${fmtDriftValue(r.recent, r.unit)}`);
    }
  }

  if (data.recentVsAllLines.length > 0) {
    lines.push(
      "",
      "=== MEASURED PATTERNS — recent games vs the whole record (◄ marks a recent rate far from the career baseline; primary evidence for habits and for what changed) ===",
    );
    lines.push(...data.recentVsAllLines);
  }

  if (data.byCharacterLines.length > 0) {
    lines.push("", "=== THE SAME MEASURES PER CHARACTER YOU PLAY (does the habit follow you across characters?) ===");
    lines.push(...data.byCharacterLines);
  }

  if (data.byMatchupLines.length > 0) {
    lines.push("", "=== THE SAME MEASURES PER OPPONENT CHARACTER (which matchups punish it?) ===");
    lines.push(...data.byMatchupLines);
  }

  const d = data.determinants;
  if (d) {
    lines.push(
      "",
      `=== WINS vs LOSSES — average in wins minus average in losses, over ${d.wins} wins and ${d.losses} losses (descriptive only; positive = higher in wins) ===`,
    );
    lines.push(JSON.stringify(d.winLossDiffs));
    if (d.situationalAverages.length > 0) {
      lines.push("", "=== SHORT vs LONG GAMES — per-game averages split at the median game length ===");
      for (const s of d.situationalAverages) lines.push(`  ${s.label}, ${s.games} games: ${JSON.stringify(s.metrics)}`);
    }
    if (d.correlations.length > 0) {
      lines.push(
        "",
        `=== PAIRWISE CORRELATIONS — Pearson r across ${d.gamesAnalyzed} games, |r| ≥ 0.25 only, strongest first (descriptive only) ===`,
      );
      for (const c of d.correlations) lines.push(`  ${c.metricA} × ${c.metricB}: r = ${c.coefficient.toFixed(2)}`);
    } else {
      lines.push("", `(Pairwise correlations omitted: ${d.gamesAnalyzed} games is too few to report them.)`);
    }
  }

  lines.push("", "Write the coaching analysis in the format from your instructions.");
  return lines.join("\n");
}

/** Strip null/undefined values and empty arrays from an object for cleaner LLM input */
export const SYSTEM_PROMPT_SCOUT = `You are MAGI, an elite Super Smash Bros. Melee scout. You are NOT coaching the player on their own play — you are producing a SCOUTING REPORT on a specific OPPONENT so the player can beat them next time.

Write for a competitive player who is about to play this opponent again. Be specific and actionable. Use the data provided; never invent numbers. Structure the report with these markdown H2 sections (use "## "):

## Head-to-Head
One or two sentences on the record and the trend, and which character/stage is worst for the player.

## How They Beat You
The concrete ways this opponent takes stocks and wins neutral against the player, grounded in the data.

## Their Tendencies
Their habits and patterns (only if tendency data is provided; otherwise infer cautiously from outcomes and say so).

## Game Plan
3-4 numbered, concrete adjustments the player should make next set. Each adjustment names the situation and the counter.

## Punish Checklist
Specific punishes/conversions the player is leaving on the table against this opponent.

Keep it tight. No filler, no generic Melee advice that isn't tied to this matchup.`;

export interface DossierHeadToHead {
  opponentTag: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  characterBreakdown: {
    opponentCharacter: string;
    wins: number;
    losses: number;
    totalGames: number;
    winRate: number;
  }[];
  stageBreakdown: { stage: string; wins: number; losses: number; totalGames: number; winRate: number }[];
}

/** The opponent's own tendencies (Phase B). Null until tendency extraction runs. */
export interface OpponentTendencies {
  gamesAnalyzed: number;
  wakeup?: { roll: number; getupAttack: number; standUp: number };
  topKillMoves?: { move: string; count: number }[];
  [k: string]: unknown;
}

/**
 * Build the opponent scouting prompt. Frames the analysis around BEATING the
 * opponent (not self-coaching). `tendencies` is the opponent's own habits when
 * available (Phase B); when null, the model infers cautiously from outcomes.
 */
export function assembleOpponentDossierPrompt(
  headToHead: DossierHeadToHead,
  yourStatsVsThem: unknown,
  playerHistory: PlayerHistory | null,
  tendencies: OpponentTendencies | null,
): string {
  const lines: string[] = [];
  if (playerHistory) {
    lines.push(assemblePlayerContext(playerHistory));
    lines.push("");
  }
  lines.push(`=== SCOUTING TARGET: ${headToHead.opponentTag} ===`);
  lines.push(`Goal: produce a game plan to BEAT ${headToHead.opponentTag} next set.`);
  lines.push("");
  lines.push("=== HEAD-TO-HEAD (player's record vs this opponent) ===");
  lines.push(JSON.stringify(stripNulls(headToHead), null, 2));
  lines.push("");
  lines.push("=== PLAYER'S OWN STATS IN THESE GAMES (how the player performed vs them) ===");
  lines.push(JSON.stringify(stripNulls(yourStatsVsThem), null, 2));
  if (tendencies) {
    lines.push("");
    lines.push("=== OPPONENT TENDENCIES (the opponent's own habits, extracted from the replays) ===");
    lines.push(JSON.stringify(stripNulls(tendencies), null, 2));
  } else {
    lines.push("");
    lines.push("(No per-habit tendency data available — infer cautiously from outcomes and stage/character splits.)");
  }
  return lines.join("\n");
}

export function stripNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    const filtered = obj.map(stripNulls).filter((v) => v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const stripped = stripNulls(val);
      if (stripped !== undefined) result[key] = stripped;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return obj;
}

/**
 * Format historical player data into a concise text block for the LLM.
 * Kept under ~500 tokens to avoid bloating the prompt.
 */
export function assemblePlayerContext(history: PlayerHistory): string {
  const lines: string[] = ["=== PLAYER PROFILE (Historical Context) ===", ""];

  // Overall record
  const { wins, losses, totalGames } = history.overallRecord;
  const decisive = wins + losses;
  const overallWinRate = decisive > 0 ? ((wins / decisive) * 100).toFixed(1) : "0.0";
  lines.push(`Lifetime record: ${wins}W-${losses}L (${overallWinRate}% win rate, ${totalGames} games)`);

  // Current streak
  if (history.currentStreak) {
    lines.push(`Current streak: ${history.currentStreak.count}-game ${history.currentStreak.type} streak`);
  }

  // Character usage
  if (history.characterWinRates.length > 0) {
    const charParts = history.characterWinRates.map(
      (c) => `${c.character}: ${c.wins}W-${c.losses}L (${(c.winRate * 100).toFixed(0)}%)`,
    );
    lines.push(`Characters played: ${charParts.join(", ")}`);
  }

  // Top matchups
  if (history.topMatchups.length > 0) {
    lines.push("");
    lines.push("Top matchups:");
    for (const m of history.topMatchups) {
      lines.push(
        `  vs ${m.opponentCharacter}: ${m.wins}W-${m.losses}L (${(m.winRate * 100).toFixed(0)}%, ${m.totalGames} games)`,
      );
    }
  }

  // Trend comparison: recent vs overall
  if (history.recentStats && history.overallStats && history.recentStats.gamesCount >= 3) {
    const recent = history.recentStats;
    const overall = history.overallStats;
    lines.push("");
    lines.push(`Recent trend (last ${recent.gamesCount} games vs overall ${overall.gamesCount} games):`);

    const formatTrend = (
      label: string,
      recentVal: number,
      overallVal: number,
      asPercent: boolean,
      lowerIsBetter: boolean = false,
    ): string => {
      const diff = recentVal - overallVal;
      const absDiff = Math.abs(diff);
      if (asPercent) {
        const rStr = (recentVal * 100).toFixed(1);
        const oStr = (overallVal * 100).toFixed(1);
        const direction =
          diff > 0.005
            ? lowerIsBetter
              ? "declining"
              : "improving"
            : diff < -0.005
              ? lowerIsBetter
                ? "improving"
                : "declining"
              : "stable";
        if (direction === "stable") return `  ${label}: ${rStr}% (stable)`;
        const arrow = direction === "improving" ? "^" : "v";
        return `  ${label}: ${rStr}% (${arrow} from ${oStr}% overall)`;
      }
      const rStr = recentVal.toFixed(1);
      const oStr = overallVal.toFixed(1);
      const direction =
        absDiff < 0.3
          ? "stable"
          : diff > 0
            ? lowerIsBetter
              ? "declining"
              : "improving"
            : lowerIsBetter
              ? "improving"
              : "declining";
      if (direction === "stable") return `  ${label}: ${rStr} (stable)`;
      const arrow = direction === "improving" ? "^" : "v";
      return `  ${label}: ${rStr} (${arrow} from ${oStr} overall)`;
    };

    lines.push(formatTrend("Neutral win rate", recent.avgNeutralWinRate, overall.avgNeutralWinRate, true));
    lines.push(formatTrend("L-cancel rate", recent.avgLCancelRate, overall.avgLCancelRate, true));
    lines.push(formatTrend("Conversion rate", recent.avgConversionRate, overall.avgConversionRate, true));
    lines.push(formatTrend("Openings/kill", recent.avgOpeningsPerKill, overall.avgOpeningsPerKill, false, true));
    lines.push(formatTrend("Damage/opening", recent.avgDamagePerOpening, overall.avgDamagePerOpening, false));
    lines.push(formatTrend("Edgeguard success", recent.avgEdgeguardSuccessRate, overall.avgEdgeguardSuccessRate, true));
  }

  return lines.join("\n");
}

/**
 * Bump when SYSTEM_PROMPT / SYSTEM_PROMPT_AGGREGATE or the data they are fed
 * changes enough that cached analyses should not be served. Stored in
 * coaching_analyses.prompt_version; cache lookups match on it.
 */
export const COACHING_PROMPT_VERSION = "4";

/**
 * PlayerSummary fields left out of the prompt: superseded by the measured
 * per-instance sections (diQuality → Measured DI; legacy recovery/edgeguard
 * counters → recovery spans) or meaningless without context.
 */
const PROMPT_OMITTED_SUMMARY_FIELDS = new Set([
  "diQuality",
  "recoveryAttempts",
  "recoverySuccessRate",
  "edgeguardAttempts",
  "edgeguardSuccessRate",
  "avgStagePosition",
  "connectCode",
]);

function promptPlayerSummary(player: PlayerSummary): unknown {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(player)) {
    if (!PROMPT_OMITTED_SUMMARY_FIELDS.has(key)) out[key] = value;
  }
  // 0 attempts would otherwise read as a 0% L-cancel rate.
  if (player.lCancelAttempts === 0) {
    delete out.lCancelRate;
    delete out.lCancelAttempts;
  }
  return stripNulls(out);
}

const HABIT_SITUATION_TEXT: Record<string, string> = {
  ledge: "ledge",
  knockdown: "knockdown",
  oos: "out of shield",
};

/**
 * Per-game habit choices for both players with punish counts — the
 * opponent's lines are the exploitable reads, the player's are the leaks.
 */
function formatHabitSection(frameEvents: GameFrameEvents, tagBySlot: [string, string]): string[] {
  const lines: string[] = [];
  for (const slot of [0, 1] as PlayerSlot[]) {
    const mine = frameEvents.habits.filter((h) => h.playerSlot === slot);
    for (const situation of ["ledge", "knockdown", "oos"]) {
      const list = mine.filter((h) => h.situation === situation);
      if (list.length === 0) continue;
      const byOption = new Map<string, { n: number; punished: number; cornered: number }>();
      for (const h of list) {
        const e = byOption.get(h.option) ?? { n: 0, punished: 0, cornered: 0 };
        e.n++;
        if (h.punished) e.punished++;
        if (h.cornered) e.cornered++;
        byOption.set(h.option, e);
      }
      const parts = [...byOption.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(
          ([option, e]) =>
            `${option} ${e.n}${e.punished > 0 ? ` (punished ${e.punished})` : ""}${e.cornered > 0 ? ` [${e.cornered} cornered]` : ""}`,
        );
      lines.push(`${tagBySlot[slot]} ${HABIT_SITUATION_TEXT[situation]} (${list.length}): ${parts.join(", ")}`);
    }
  }
  return lines;
}

/**
 * Background a single-game or set review may use but never recite: the
 * player's record in this exact matchup (their character vs the opponent's),
 * excluding the game(s) under review. Lifetime record, other characters and
 * overall trends stay out — they belong to the career analysis.
 */
export interface CoachingBackground {
  matchupRecord?:
    | { character: string; opponentCharacter: string; wins: number; losses: number; games: number }
    | undefined;
}

export function assembleUserPrompt(
  gameResults: GameResult[],
  targetPlayerTag: string,
  background?: CoachingBackground | undefined,
  patterns?: RecurringPatterns | null,
): string {
  const first = gameResults[0];
  if (!first) throw new Error("assembleUserPrompt called with empty gameResults");
  const p1 = first.gameSummary.players[0];
  const p2 = first.gameSummary.players[1];

  const lines: string[] = [];

  const record = background?.matchupRecord;
  if (record && record.games > 0) {
    lines.push(
      `Background only, do not recite: before this ${gameResults.length > 1 ? "set" : "game"}, ${targetPlayerTag}'s record as ${record.character} vs ${record.opponentCharacter} was ${record.wins}W-${record.losses}L over ${record.games} games.`,
    );
    lines.push("");
  }

  lines.push(
    `Analyze this ${gameResults.length > 1 ? `${gameResults.length}-game set` : "game"} between ${p1.tag} (${p1.character}) and ${p2.tag} (${p2.character}) from the perspective of ${targetPlayerTag}.`,
  );

  const targetParts: PatternData[] = [];

  for (const result of gameResults) {
    const g = result.gameSummary;
    const gp1 = g.players[0];
    const gp2 = g.players[1];
    const r = g.result;
    const tagBySlot: [string, string] = [gp1.tag, gp2.tag];
    const targetSlot = findPlayerIdx(g, targetPlayerTag) as PlayerSlot;
    targetParts.push(patternsFromFrameEvents(result.frameEvents, targetSlot, "this game"));

    // keyMoments are printed as the timeline below; habit profiles as the habit section.
    const insightsFor = (i: 0 | 1) => {
      const d = result.derivedInsights[i];
      return {
        performanceByStock: d.performanceByStock,
        bestConversion: d.bestConversion,
        lowYieldHighPercentOpening: d.worstMissedPunish,
        adaptationSignals: d.adaptationSignals,
      };
    };
    const insightsObj = { [gp1.tag]: insightsFor(0), [gp2.tag]: insightsFor(1) };

    // Build key moments timeline for both players
    const p1Moments = result.derivedInsights[0].keyMoments;
    const p2Moments = result.derivedInsights[1].keyMoments;
    // Merge and sort chronologically, tagging with player name
    const allMoments = [
      ...p1Moments.map((m) => ({ ...m, player: gp1.tag })),
      ...p2Moments.map((m) => ({ ...m, player: gp2.tag })),
    ].sort((a, b) => a.frame - b.frame);

    lines.push(
      "",
      `=== GAME ${g.gameNumber} — ${g.stage} ===`,
      `Result: ${r.winner} wins (${r.finalStocks[0]}-${r.finalStocks[1]} stocks, ${r.finalPercents[0]}%-${r.finalPercents[1]}%)`,
      "",
      `--- ${gp1.tag} (${gp1.character})${targetSlot === 0 ? " [PLAYER]" : " [OPPONENT]"} summary ---`,
      JSON.stringify(promptPlayerSummary(gp1)),
      `--- ${gp2.tag} (${gp2.character})${targetSlot === 1 ? " [PLAYER]" : " [OPPONENT]"} summary ---`,
      JSON.stringify(promptPlayerSummary(gp2)),
      `--- Per-stock / conversions ---`,
      JSON.stringify(stripNulls(insightsObj)),
    );

    // Defensive option choices with punish counts (definition: frameEvents.isHabitPunished)
    const habitLines = formatHabitSection(result.frameEvents, tagBySlot);
    if (habitLines.length > 0) {
      lines.push(
        "",
        `--- Option choices (punished = hit or grabbed during the option or within 20 frames after it ended) ---`,
      );
      for (const l of habitLines) lines.push(`  ${l}`);
    }

    // Measured DI: stick-input ground truth for deaths + throw DI
    const diLines = formatMeasuredDISection(result.frameEvents, tagBySlot);
    if (diLines.length > 0) {
      lines.push("", `--- Measured DI (stick on the final hit's last hitlag frame vs the launch direction) ---`);
      for (const l of diLines) lines.push(`  ${l}`);
    }

    // Recovery blueprint + edgeguard commitment matrix
    const recoveryLines = formatRecoverySection(result.frameEvents, tagBySlot);
    if (recoveryLines.length > 0) {
      lines.push("", `--- Recovery & Edgeguard Commitment (per-span measurements) ---`);
      for (const l of recoveryLines) lines.push(`  ${l}`);
    }

    // Shield frame-gap audit
    const shieldLines = formatShieldSection(result.frameEvents, tagBySlot);
    if (shieldLines.length > 0) {
      lines.push("", `--- Shield Frame-Gap Audit (measured per blocked hit; positive gap = defender's advantage) ---`);
      for (const l of shieldLines) lines.push(`  ${l}`);
    }

    // Whiff-punish ledger
    const whiffLines = formatWhiffSection(result.frameEvents, tagBySlot);
    if (whiffLines.length > 0) {
      lines.push("", `--- Whiff-Punish Ledger (free punishes offered vs taken) ---`);
      for (const l of whiffLines) lines.push(`  ${l}`);
    }

    // Append timestamped key moments timeline
    if (allMoments.length > 0) {
      lines.push("", `--- Key Moments Timeline (the only valid timestamps) ---`);
      for (const m of allMoments) {
        lines.push(`  [${m.timestamp}] ${m.player}: ${m.description}`);
      }
    }
  }

  // Cross-game evidence: this game/set next to the player's own history.
  const thisColumn = mergePatternData(targetParts, gameResults.length > 1 ? "this set" : "this game");
  const patternLines = formatRecurringPatterns(patterns, thisColumn);
  if (patternLines.length > 0) {
    lines.push(
      "",
      `=== RECURRING PATTERNS — ${targetPlayerTag}'s measured habits, ${gameResults.length > 1 ? "this set" : "this game"} vs their own history (primary evidence for what is a habit) ===`,
    );
    for (const l of patternLines) lines.push(l);
  }

  lines.push("", "Write the coaching analysis in the format from your instructions.");

  return lines.join("\n");
}

export const SYSTEM_PROMPT_SESSION = `You are MAGI Oracle reviewing one day of Melee play.

Write exactly two paragraphs (2-4 sentences each).

Paragraph 1 — What worked: reference one or two concrete numbers from the day's games and what that suggests the player was doing well.

Paragraph 2 — Next focus: pick the single most valuable thing to improve next session, grounded in a number from the data. End with one concrete drill the player can do in Unclepunch or training mode.

No bullet lists, no headers, no meta-commentary. Straight prose.`;

export const SYSTEM_PROMPT_PRACTICE = `You are MAGI Oracle writing a practice plan for a Melee player.

Input: a weakness profile with numbers. Output: JSON only — no markdown, no commentary. Shape:

{
  "name": "short plan name, 2-4 words",
  "drills": [
    { "name": "drill name", "target": "what to aim for, concrete and measurable" }
  ]
}

Constraints:
- 3 to 5 drills total.
- Every drill must map to a specific weakness in the input.
- Drill names: concrete Melee tech (e.g. "Shield drop → Uair OOS", "Ledgedash to tipper").
- Targets: measurable (e.g. "8/10 successful", "under 4 frames GALINT").
- No "practice neutral" or other vague prose.

Return ONLY the JSON object, nothing else.`;

export const SYSTEM_PROMPT_ORACLE = `You are MAGI Oracle — a Melee coaching companion. You speak directly, like a senior training partner, not a chatbot.

You have access to a summary of the user's last games below. When the user asks a question:
- Cite at least one concrete number from the data (e.g. "Your L-cancel dropped from 91% to 84% last week").
- Be specific. "Work on your neutral" is useless; "Your dash-dance grab hit rate against Fox is 18% — you're committing to grab too early" is useful.
- If the data doesn't support an answer, say so plainly and suggest what replay or stat would.
- Format: short paragraphs. Use **bold** sparingly. Use numbered lists for multi-step advice.
- Do not invent stats. If something isn't in the data, don't reference it.`;

// ── Cornerman (between-games coaching) ────────────────────────────────

export const SYSTEM_PROMPT_CORNERMAN = `You are MAGI's Cornerman — the coach in a Melee player's corner BETWEEN GAMES of a live set. The player has roughly 20 seconds to read you. Brevity is life or death.

Output EXACTLY this markdown structure and nothing else — no greeting, no recap, no sign-off:

## The Read
2-3 bullets. The opponent's most exploitable habits THIS SET, each with its number from the data (e.g. "They teched in place 5/7 times after knockdown — charge a smash, don't chase").

## Where You're Bleeding
1-2 bullets. The concrete way the player is losing stocks or neutral, grounded in the data.

## The Adjustment
ONE imperative sentence. The single highest-leverage change for the next game.

Hard rules: at most 120 words total. Never invent numbers. Prefer habits with high counts over one-off events. Use plain language a busy player can read mid-set. Do not use unexplained abbreviations or internal stat names: write "neutral win rate", "average death percent", "out of shield", "directional influence", "crouch cancel", and "invincibility after leaving ledge" instead of WR, avg, OOS, DI, CC, or GALINT. If a prior scouting dossier is provided, use it only when this set's data is thin — live data wins conflicts.`;

function formatHabit(label: string, habit: HabitProfile): string {
  if (habit.options.length === 0) return `  ${label}: no data`;
  const total = habit.options.reduce((sum, o) => sum + o.frequency, 0);
  // options are already sorted descending by frequency (buildHabitProfile sorts them)
  const parts = habit.options.slice(0, 4).map((o) => `${o.action} ${o.frequency}/${total}`);
  return `  ${label}: ${parts.join(", ")}`;
}

/** Max characters of a prior dossier to inject — live set data is the priority */
const CORNERMAN_DOSSIER_CAP = 2000;

/**
 * Build the between-games Cornerman prompt from the live set so far.
 * `games` is chronological; the last entry is the game that just finished.
 * Callers should bound `games` (the live handler slices to recent games) — every entry is rendered in full.
 * When callers slice to recent games, pass the full set length as `totalGames` so header/per-game
 * numbering stays truthful (e.g. 2 of 5 games passed → labels read "Game 4" and "Game 5").
 */
export function assembleCornermanPrompt(
  games: GameResult[],
  targetTag: string,
  setScore: { wins: number; losses: number },
  dossierText: string | null,
  totalGames: number = games.length,
): string {
  if (games.length === 0) throw new Error("assembleCornermanPrompt requires at least one game");
  const last = games[games.length - 1]!;
  const lastIdx = findPlayerIdx(last.gameSummary, targetTag);
  const lastOppIdx = lastIdx === 0 ? 1 : 0;
  const opponent = last.gameSummary.players[lastOppIdx];

  const lines: string[] = [];
  lines.push(
    `=== LIVE SET vs ${opponent.tag} (${opponent.character}) — score ${setScore.wins}-${setScore.losses}, ${totalGames} game(s) played, game ${totalGames + 1} starting ===`,
  );
  lines.push(`You are advising: ${targetTag}`);
  lines.push("");

  for (let i = 0; i < games.length; i++) {
    const gr = games[i]!;
    const idx = findPlayerIdx(gr.gameSummary, targetTag);
    const oppIdx = idx === 0 ? 1 : 0;
    const me = gr.gameSummary.players[idx];
    const opp = gr.gameSummary.players[oppIdx];
    const myInsights = gr.derivedInsights[idx];
    const oppInsights = gr.derivedInsights[oppIdx];
    const pStocks = gr.gameSummary.result.finalStocks[idx];
    const oStocks = gr.gameSummary.result.finalStocks[oppIdx];
    const outcome =
      (pStocks > 0 && oStocks > 0) || gr.gameSummary.result.winner === "Unknown"
        ? "DRAW (no contest)"
        : gr.gameSummary.result.winner === me.tag
          ? "WON"
          : "LOST";

    lines.push(`--- Game ${totalGames - games.length + i + 1}: ${gr.gameSummary.stage}, ${outcome} ---`);
    lines.push(
      `  Your numbers: neutral win rate ${(me.neutralWinRate * 100).toFixed(0)}%, openings per kill ${me.openingsPerKill.toFixed(1)}, conversion rate ${(me.conversionRate * 100).toFixed(0)}%, average death percent ${me.avgDeathPercent.toFixed(0)}%`,
    );
    lines.push(
      `  Opponent numbers: neutral win rate ${(opp.neutralWinRate * 100).toFixed(0)}%, openings per kill ${opp.openingsPerKill.toFixed(1)}, edgeguard success ${(opp.edgeguardSuccessRate * 100).toFixed(0)}%`,
    );
    lines.push(formatHabit("Opponent after knockdown", oppInsights.afterKnockdown));
    lines.push(formatHabit("Opponent at ledge", oppInsights.afterLedgeGrab));
    lines.push(formatHabit("Opponent under shield pressure", oppInsights.afterShieldPressure));
    const deaths = myInsights.keyMoments.filter((m) => m.type === "death").slice(0, 4);
    if (deaths.length > 0) {
      lines.push(`  Your deaths: ${deaths.map((d) => `[${d.timestamp}] ${d.description}`).join("; ")}`);
    }
    lines.push("");
  }

  if (games.length >= 2) {
    lines.push("=== ADAPTATION ACROSS SET ===");
    const mySignals = computeAdaptationSignals(games, targetTag);
    const oppSignals = computeAdaptationSignals(games, opponent.tag);
    lines.push("Your trajectory:");
    for (const s of mySignals) {
      lines.push(`  ${s.metric}: ${s.game1Value.toFixed(2)} -> ${s.lastGameValue.toFixed(2)} (${s.direction})`);
    }
    lines.push("Opponent trajectory:");
    for (const s of oppSignals) {
      lines.push(`  ${s.metric}: ${s.game1Value.toFixed(2)} -> ${s.lastGameValue.toFixed(2)} (${s.direction})`);
    }
    lines.push("");
  }

  if (dossierText) {
    lines.push("=== PRIOR SCOUTING DOSSIER ===");
    lines.push("(pre-set data; use only where live set data is thin)");
    lines.push("");
    lines.push(
      dossierText.length > CORNERMAN_DOSSIER_CAP ? dossierText.slice(0, CORNERMAN_DOSSIER_CAP) + "…" : dossierText,
    );
    lines.push("");
  }

  lines.push(`Produce the between-games card for game ${totalGames + 1}.`);
  return lines.join("\n");
}
