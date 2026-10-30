import "./PunishEconomy.css";
import { Card } from "../../components/ui/Card";
import { KPI } from "../../components/ui/KPI";
import { DataTable } from "../../components/ui/DataTable";
import { useCharacterEventProfile } from "../../hooks/queries";
import { EVENT_SAMPLE_GUARDS, SHIELD_GRADE_ORDER } from "../../../characterEventProfile";
import type { CharacterEventProfile } from "../../../characterEventProfile";
import { accentVars, orderBy, pct, prettyLabel, ratio } from "./shared";
import type { CharacterModuleProps } from "./shared";

/** Maps pipeline grade keys to a stable css-suffix; unknown grades render faint. */
const GRADE_CLASS: Record<string, string> = {
  "punish-taken": "taken",
  "punish-missed": "missed",
  "unsafe-challenge": "unsafe",
  "correct-hold": "hold",
  neutral: "faint",
  pressured: "faint",
};

function gradeClass(grade: string): string {
  return `punish-economy-seg-${GRADE_CLASS[grade] ?? "faint"}`;
}

function gradeCount(grades: CharacterEventProfile["shield"]["defense"]["grades"], grade: string): number {
  return grades.find((g) => g.grade === grade)?.count ?? 0;
}

function fmtFrames(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? `${value}f` : `${value.toFixed(1)}f`;
}

export function PunishEconomy({ character, color, glowColor }: CharacterModuleProps) {
  const { data: profile } = useCharacterEventProfile(character);
  if (!profile) return null;

  const { whiffs, shield } = profile;

  // -- Whiff punishing ------------------------------------------------------
  const showCapture = whiffs.captureOpportunities >= EVENT_SAMPLE_GUARDS.whiffCaptureMin;
  const exposureRows = [...whiffs.exposure]
    .filter((row) => row.opportunities > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const showWhiffSection = showCapture || exposureRows.length > 0;

  // -- Shield ---------------------------------------------------------------
  const showShieldSection = shield.defense.total >= EVENT_SAMPLE_GUARDS.shieldGradeMin;

  if (!showWhiffSection && !showShieldSection) return null;

  const grades = orderBy(
    shield.defense.grades.filter((g) => g.count > 0),
    (g) => g.grade,
    SHIELD_GRADE_ORDER,
  );
  const gradeTotal = grades.reduce((sum, g) => sum + g.count, 0);
  const guaranteedTaken = gradeCount(shield.defense.grades, "punish-taken");
  const guaranteedMissed = gradeCount(shield.defense.grades, "punish-missed");

  const worstOffenders = [...shield.defense.byMove]
    .filter((m) => m.blocks >= EVENT_SAMPLE_GUARDS.shieldMoveMin && m.punishTaken + m.punishMissed > 0)
    .sort((a, b) => b.punishMissed - a.punishMissed)
    .slice(0, 3);

  const pressureRows = [...shield.pressure.byMove]
    .filter((m) => m.blocks >= EVENT_SAMPLE_GUARDS.shieldMoveMin)
    .sort((a, b) => b.punishedByDefender - a.punishedByDefender)
    .slice(0, 3);

  return (
    <Card title="Missed chances & shield safety" className="punish-economy" style={accentVars(color, glowColor)}>
      {showWhiffSection && (
        <div className="punish-economy-section">
          <div className="punish-economy-subheader">After the opponent misses</div>
          {showCapture && (
            <div className="punish-economy-kpis">
              <KPI
                label="Chances you used"
                value={pct(whiffs.capturePunished, whiffs.captureOpportunities)}
                sub={`${ratio(whiffs.capturePunished, whiffs.captureOpportunities)} chances where you reached and hit the opponent`}
              />
              {whiffs.captureMedianReactionDelay !== null && (
                <KPI
                  label="Time to hit back"
                  value={fmtFrames(whiffs.captureMedianReactionDelay)}
                  sub="frames after a missed attack (60 frames = 1 second)"
                />
              )}
            </div>
          )}
          {exposureRows.length > 0 && (
            <div className="punish-economy-block">
              <div className="punish-economy-minihead">When your attacks miss</div>
              <DataTable colWidths={[undefined, "70px", "96px"]}>
                <thead>
                  <tr>
                    <th>Move</th>
                    <th>Missed attacks</th>
                    <th>Punished</th>
                  </tr>
                </thead>
                <tbody>
                  {exposureRows.map((row) => {
                    const hot = row.punished / row.opportunities > 0.4;
                    return (
                      <tr key={row.attackLabel}>
                        <td>{prettyLabel(row.attackLabel)}</td>
                        <td className="punish-economy-mono">{row.total}</td>
                        <td className={hot ? "punish-economy-mono punish-economy-cell-hot" : "punish-economy-mono"}>
                          {ratio(row.punished, row.opportunities)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              <div className="punish-economy-caption">Times you were hit / chances the opponent had to hit back.</div>
            </div>
          )}
        </div>
      )}

      {showShieldSection && (
        <div className="punish-economy-section">
          <div className="punish-economy-subheader">Shield</div>
          <div className="punish-economy-block">
            <div className="punish-economy-bar" aria-hidden="true">
              {grades.map((g) => (
                <div
                  key={g.grade}
                  className={`punish-economy-seg ${gradeClass(g.grade)}`}
                  style={{ width: `${(g.count / Math.max(1, gradeTotal)) * 100}%` }}
                  title={`${prettyLabel(g.grade)}: ${g.count}`}
                />
              ))}
            </div>
            <div className="punish-economy-legend">
              {grades.map((g) => (
                <span key={g.grade} className="punish-economy-legend-item">
                  <span className={`punish-economy-swatch ${gradeClass(g.grade)}`} />
                  {prettyLabel(g.grade)} <b>{g.count}</b>
                </span>
              ))}
            </div>
            <div className="punish-economy-caption">Based on {shield.defense.total} blocked hits</div>
          </div>
          <div className="punish-economy-kpis">
            <KPI
              label="Clear chances after blocking"
              value={`taken ${guaranteedTaken} · missed ${guaranteedMissed}`}
              sub={`${guaranteedTaken + guaranteedMissed} clear openings across ${shield.defense.total} blocked hits`}
            />
          </div>
          {worstOffenders.length > 0 && (
            <div className="punish-economy-block">
              <div className="punish-economy-minihead">Moves you could hit back after</div>
              {worstOffenders.map((m) => (
                <div key={m.attackLabel} className="punish-economy-move-row">
                  <span className="punish-economy-move-label">{prettyLabel(m.attackLabel)}</span>
                  <span className="punish-economy-mono">
                    missed {ratio(m.punishMissed, m.punishTaken + m.punishMissed)} · avg gap {fmtFrames(m.avgFrameGap)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pressureRows.length > 0 && (
            <div className="punish-economy-block">
              <div className="punish-economy-minihead">When you hit their shield</div>
              {pressureRows.map((m) => {
                const hot = m.punishedByDefender / m.blocks > 0.3;
                return (
                  <div
                    key={m.attackLabel}
                    className={hot ? "punish-economy-move-row punish-economy-row-hot" : "punish-economy-move-row"}
                  >
                    <span className="punish-economy-move-label">{prettyLabel(m.attackLabel)}</span>
                    <span className="punish-economy-mono">
                      punished {ratio(m.punishedByDefender, m.blocks)} · avg gap {fmtFrames(m.avgFrameGap)}
                    </span>
                  </div>
                );
              })}
              <div className="punish-economy-caption">Times they hit you back / blocked hits.</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
