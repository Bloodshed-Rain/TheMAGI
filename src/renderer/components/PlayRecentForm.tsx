import { useEffect } from "react";
import { usePerformanceHub } from "../hooks/queries";

export function PlayRecentForm() {
  const { data, isPending, error, refetch } = usePerformanceHub();
  useEffect(
    () =>
      window.clippi.onImported(() => {
        void refetch();
      }),
    [refetch],
  );
  if (error)
    return (
      <p role="alert" className="error-text">
        Could not load recent form.
      </p>
    );
  if (isPending) return <p className="helper-text">Loading recent games…</p>;
  if (!data?.sample.currentGames)
    return <p className="helper-text">Import games to build your recent-form baseline.</p>;
  return (
    <>
      <p className="helper-text">
        Last {data.sample.currentGames} games
        {data.sample.baselineGames ? ` vs the previous ${data.sample.baselineGames}` : " · baseline pending"}
      </p>
      {data.metrics
        .filter((metric) =>
          ["neutralWinRate", "lCancelRate", "avgDamagePerOpening", "openingsPerKill"].includes(metric.key),
        )
        .map((metric) => {
          const percentage = metric.key === "neutralWinRate" || metric.key === "lCancelRate";
          const value = (number: number) => (percentage ? `${(number * 100).toFixed(1)}%` : number.toFixed(1));
          return (
            <div className="play-form-metric" key={metric.key}>
              <div>
                <span>{metric.label}</span>
                <strong>{value(metric.current)}</strong>
              </div>
              <small>{metric.baseline == null ? "Baseline pending" : `Previously ${value(metric.baseline)}`}</small>
            </div>
          );
        })}
    </>
  );
}
