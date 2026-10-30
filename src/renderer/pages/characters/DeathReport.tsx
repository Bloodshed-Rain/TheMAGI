import "./DeathReport.css";
import { Card } from "../../components/ui/Card";
import { KPI } from "../../components/ui/KPI";
import { DataTable } from "../../components/ui/DataTable";
import { useCharacterEventProfile } from "../../hooks/queries";
import { DI_VERDICT_ORDER, EVENT_SAMPLE_GUARDS } from "../../../characterEventProfile";
import type { CharacterModuleProps } from "./shared";
import { accentVars, orderBy, pct, prettyLabel, ratio } from "./shared";

const VERDICT_LABELS: Record<string, string> = {
  NO_DI: "No steering detected",
  WRONG_DI: "Steered toward danger",
  OK_DI: "Some helpful steering",
  GOOD_DI: "Helpful steering",
  SD: "Self-destruct",
};

const VERDICT_CLASSES: Record<string, string> = {
  NO_DI: "death-report-c-no-di",
  WRONG_DI: "death-report-c-wrong-di",
  OK_DI: "death-report-c-ok-di",
  GOOD_DI: "death-report-c-good-di",
  SD: "death-report-c-sd",
};

function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict] ?? prettyLabel(verdict);
}

function verdictClass(verdict: string): string {
  return VERDICT_CLASSES[verdict] ?? "death-report-c-unknown";
}

const RESOURCE_FAULT_ALERT_RATE = 0.15;

export function DeathReport({ character, color, glowColor }: CharacterModuleProps) {
  const { data: profile } = useCharacterEventProfile(character);
  if (!profile) return null;
  const { deaths } = profile;
  if (deaths.total === 0) return null;

  const verdicts = orderBy(
    deaths.verdicts.filter((v) => v.count > 0),
    (v) => v.verdict,
    DI_VERDICT_ORDER,
  );
  const sdCount = deaths.verdicts.find((v) => v.verdict === "SD")?.count ?? 0;
  const resourceFaultBad = deaths.resourceFaults / deaths.total > RESOURCE_FAULT_ALERT_RATE;
  const killerMoves = deaths.killerMoves.filter((m) => m.count >= EVENT_SAMPLE_GUARDS.killerMoveMin).slice(0, 5);
  const directions = [...deaths.directions].sort((a, b) => b.count - a.count);
  const throwRows = deaths.throwDI.filter((t) => t.total >= EVENT_SAMPLE_GUARDS.throwDirectionMin);

  return (
    <Card title="How you lose stocks" className="death-report" style={accentVars(color, glowColor)}>
      <div className="death-report-bar" role="img" aria-label="Steering after hits that led to losing stocks">
        {verdicts.map((v) => (
          <div
            key={v.verdict}
            className={`death-report-seg ${verdictClass(v.verdict)}`}
            style={{ width: pct(v.count, deaths.total, 1) }}
            title={`${verdictLabel(v.verdict)} ${ratio(v.count, deaths.total)}`}
          />
        ))}
      </div>
      <div className="death-report-legend">
        {verdicts.map((v) => (
          <span key={v.verdict} className="death-report-legend-item">
            <span className={`death-report-chip ${verdictClass(v.verdict)}`} />
            {verdictLabel(v.verdict)}
            <span className="death-report-legend-n">{ratio(v.count, deaths.total)}</span>
          </span>
        ))}
      </div>
      {deaths.total < EVENT_SAMPLE_GUARDS.deathVerdictMin && (
        <div className="death-report-caption">Only {deaths.total} stocks recorded so far</div>
      )}

      <div className="death-report-kpis">
        <div className="death-report-kpi">
          <KPI
            label="Damage when you lost a stock"
            value={
              <span className="death-report-mono">
                {deaths.avgDeathPercent != null ? `${Math.round(deaths.avgDeathPercent)}%` : "—"}
              </span>
            }
            sub={`Based on ${deaths.total} lost stocks`}
          />
        </div>
        <div className={`death-report-kpi${resourceFaultBad ? " death-report-kpi-bad" : ""}`}>
          <KPI
            label="Unused double jumps"
            value={<span className="death-report-mono">{ratio(deaths.resourceFaults, deaths.total)}</span>}
            sub="Lost a stock with a double jump still available"
            subTone={resourceFaultBad ? "bad" : "neutral"}
          />
        </div>
        {sdCount > 0 && (
          <div className="death-report-kpi">
            <KPI label="Self-Destructs" value={<span className="death-report-mono">{sdCount}</span>} />
          </div>
        )}
      </div>

      {killerMoves.length > 0 && (
        <div className="death-report-section">
          <div className="death-report-section-label">Moves that took your stocks</div>
          <DataTable colWidths={[undefined, "72px", "72px"]}>
            <thead>
              <tr>
                <th>Move</th>
                <th>Kills</th>
                <th>Avg %</th>
              </tr>
            </thead>
            <tbody>
              {killerMoves.map((m) => (
                <tr key={m.moveId != null ? `id-${m.moveId}` : `name-${m.moveName}`}>
                  <td>{prettyLabel(m.moveName)}</td>
                  <td>{m.count}</td>
                  <td>{m.avgDeathPercent != null ? `${Math.round(m.avgDeathPercent)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
      {directions.length > 0 && (
        <div className="death-report-directions">
          {directions.map((d) => `${prettyLabel(d.direction)} ${d.count}`).join(" · ")}
        </div>
      )}

      {throwRows.length > 0 && (
        <div className="death-report-section">
          <div className="death-report-section-label">Steering after throws (DI)</div>
          {throwRows.map((t) => (
            <div key={t.direction} className="death-report-throw-row">
              <span className="death-report-throw-label">vs {prettyLabel(t.direction)} throw</span>
              <span className="death-report-throw-bar">
                <span className="death-report-throw-fill" style={{ width: pct(t.noDI, t.total, 1) }} />
              </span>
              <span className="death-report-throw-n">
                {pct(t.noDI, t.total)} without steering · {ratio(t.noDI, t.total)}
              </span>
            </div>
          ))}
          <div className="death-report-caption">
            DI means holding a direction to change where a hit sends you. No input was detected on these throws.
          </div>
        </div>
      )}
    </Card>
  );
}
