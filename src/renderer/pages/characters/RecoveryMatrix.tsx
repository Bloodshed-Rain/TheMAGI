import "./RecoveryMatrix.css";
import { Card } from "../../components/ui/Card";
import { useCharacterEventProfile } from "../../hooks/queries";
import { EVENT_SAMPLE_GUARDS, RECOVERY_ROUTE_ORDER, EDGEGUARD_DEPTH_ORDER } from "../../../characterEventProfile";
import { accentVars, orderBy, pct, prettyLabel, ratio } from "./shared";
import type { CharacterModuleProps } from "./shared";

const DJ_EARLY_DETAIL_MIN = 8;

export function RecoveryMatrix({ character, color, glowColor }: CharacterModuleProps) {
  const { data: profile } = useCharacterEventProfile(character);
  if (!profile) return null;

  const { ownSpans, routes, djEarly, contested, edgeguard } = profile.recovery;
  const { opportunities, byDepth, invincibleLedgeSpans } = edgeguard;
  if (ownSpans === 0 && opportunities === 0) return null;

  const routeRows = orderBy(routes, (r) => r.route, RECOVERY_ROUTE_ORDER);
  const routesGuarded = ownSpans >= EVENT_SAMPLE_GUARDS.recoveryRouteMin;
  const djDiedRate = djEarly.total > 0 ? djEarly.died / djEarly.total : 0;
  const contestedDiedRate = contested.total > 0 ? contested.died / contested.total : 0;

  const knownDepths = new Set<string>(EDGEGUARD_DEPTH_ORDER);
  const depthCells = [
    ...EDGEGUARD_DEPTH_ORDER.map((depth) => byDepth.find((d) => d.depth === depth) ?? { depth, total: 0, kills: 0 }),
    ...byDepth.filter((d) => !knownDepths.has(d.depth)),
  ];

  return (
    <Card title="Getting back to stage" className="recovery-matrix" style={accentVars(color, glowColor)}>
      {ownSpans > 0 && (
        <div className="recovery-matrix-section">
          <div className="recovery-matrix-section-label">Your attempts to return</div>
          {routesGuarded ? (
            <>
              <div className="recovery-matrix-routes">
                {routeRows.map((r) => (
                  <div className="recovery-matrix-route-row" key={r.route}>
                    <span className="recovery-matrix-route-label">{prettyLabel(r.route)}</span>
                    <span className="recovery-matrix-route-bar">
                      <span
                        className="recovery-matrix-route-fill"
                        style={{ width: `${ownSpans > 0 ? (r.total / ownSpans) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="recovery-matrix-route-ratio">{ratio(r.total, ownSpans)}</span>
                    <span className="recovery-matrix-died">lost a stock {pct(r.died, r.total)}</span>
                  </div>
                ))}
              </div>
              <div className="recovery-matrix-stat-line">
                Used your double jump early:{" "}
                <b className="recovery-matrix-stat-value">{ratio(djEarly.total, ownSpans)}</b>
                {djEarly.total >= DJ_EARLY_DETAIL_MIN && (
                  <span className={djDiedRate > 0.5 ? "recovery-matrix-died" : "recovery-matrix-stat-detail"}>
                    {" "}
                    — lost a stock on {pct(djEarly.died, djEarly.total)} of those
                  </span>
                )}
              </div>
              {contested.total > 0 && (
                <div className="recovery-matrix-stat-line">
                  When the opponent challenged you: lost a stock{" "}
                  <b className={contestedDiedRate > 0.5 ? "recovery-matrix-died" : "recovery-matrix-stat-value"}>
                    {pct(contested.died, contested.total)}
                  </b>{" "}
                  of {contested.total}
                </div>
              )}
            </>
          ) : (
            <div className="recovery-matrix-under-guard">
              n={ownSpans} recoveries logged — need {EVENT_SAMPLE_GUARDS.recoveryRouteMin}
            </div>
          )}
        </div>
      )}

      {opportunities > 0 && (
        <div className="recovery-matrix-section">
          <div className="recovery-matrix-section-label">Stopping the opponent returning</div>
          <div className="recovery-matrix-opportunities">{opportunities} opponent recoveries</div>
          <div className="recovery-matrix-depth-row">
            {depthCells.map((cell) => {
              const dimmed = cell.total < EVENT_SAMPLE_GUARDS.edgeguardCellMin;
              return (
                <div
                  className={
                    dimmed ? "recovery-matrix-depth-cell recovery-matrix-depth-dim" : "recovery-matrix-depth-cell"
                  }
                  key={cell.depth}
                >
                  <div className="recovery-matrix-depth-label">{prettyLabel(cell.depth)}</div>
                  <div className="recovery-matrix-depth-rate">{dimmed ? "—" : pct(cell.kills, cell.total)}</div>
                  <div className="recovery-matrix-depth-n">{cell.total} attempts</div>
                </div>
              );
            })}
          </div>
          {invincibleLedgeSpans > 0 && (
            <div className="recovery-matrix-stat-line">
              Held the ledge while invincible on{" "}
              <b className="recovery-matrix-stat-value">{ratio(invincibleLedgeSpans, opportunities)}</b>
            </div>
          )}
          <div className="recovery-matrix-footer">
            These rates describe your games. Going farther offstage does not necessarily improve your chances.
          </div>
        </div>
      )}
    </Card>
  );
}
