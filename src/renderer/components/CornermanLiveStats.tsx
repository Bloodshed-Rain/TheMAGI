import {
  computeStatDelta,
  formatElapsed,
  formatLiveStatValue,
  LIVE_STAT_DEFS,
  type CornermanLiveStatDef,
  type CornermanLiveStatId,
  type CornermanLiveStatValue,
} from "../../cornermanLiveStats";

function findTarget(snapshot: CornermanLiveSnapshot): CornermanLivePlayerStats | null {
  return snapshot.players.find((p) => p.isTarget) ?? snapshot.players[0] ?? null;
}

function statById(player: CornermanLivePlayerStats, id: CornermanLiveStatId): CornermanLiveStatValue | undefined {
  return player.stats.find((s) => s.id === id);
}

// ── Cornerman page: full registry table ───────────────────────────────

function formatBaseline(def: CornermanLiveStatDef, value: number | null): string {
  if (value == null) return "—";
  switch (def.format) {
    case "percent":
    case "countTotal": // baseline is a rate (e.g. neutral_win_rate) even when the live value is count/total
      return `${Math.round(value * 100)}%`;
    case "decimal":
      return value.toFixed(1);
    case "integer":
      return String(Math.round(value));
    default:
      return "—";
  }
}

function youCell(def: CornermanLiveStatDef, value: CornermanLiveStatValue | undefined): string {
  if (!value) return "—";
  const main = formatLiveStatValue(def, value);
  // Rate stats read clearer with the raw fraction beside the percentage.
  if (def.format === "percent" && value.total > 0) return `${value.count}/${value.total} · ${main}`;
  if (def.format === "countTotal" && value.value != null) return `${main} · ${Math.round(value.value * 100)}%`;
  return main;
}

export function CornermanLiveStatsTable({ snapshot }: { snapshot: CornermanLiveSnapshot | null }) {
  if (!snapshot) return null;
  const target = findTarget(snapshot);
  const opponent = snapshot.players.find((p) => !p.isTarget) ?? null;
  if (!target) return null;

  return (
    <div className="cornerman-live-stats-wrap">
      <div className="cornerman-live-stats-meta">
        <span className={`overlay-stats-pill overlay-stats-pill-${snapshot.phase === "ended" ? "final" : "live"}`}>
          {snapshot.phase === "ended" ? "FINAL" : "LIVE"}
        </span>
        <span className="overlay-stats-clock">{formatElapsed(snapshot.elapsedSeconds)}</span>
      </div>
      <table className="cornerman-live-stats-table">
        <thead>
          <tr>
            <th>Stat</th>
            <th>You</th>
            <th>{opponent ? opponent.tag || opponent.character : "Opponent"}</th>
            <th>Your usual</th>
            <th aria-label="Delta versus your usual">Δ</th>
          </tr>
        </thead>
        <tbody>
          {LIVE_STAT_DEFS.map((def) => {
            const you = statById(target, def.id);
            const opp = opponent ? statById(opponent, def.id) : undefined;
            const delta = you ? computeStatDelta(def, you, snapshot.baseline) : null;
            const baseVal = def.baselineKey && snapshot.baseline ? snapshot.baseline[def.baselineKey] : null;
            return (
              <tr key={def.id}>
                <td className="cls-label">{def.label}</td>
                <td className="cls-you">{youCell(def, you)}</td>
                <td className="cls-opp">{opp ? formatLiveStatValue(def, opp) : "—"}</td>
                <td className="cls-usual">{formatBaseline(def, baseVal)}</td>
                <td className={`cls-delta ${delta ? (delta.isBetter ? "is-better" : "is-worse") : ""}`}>
                  {delta ? delta.glyph : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
