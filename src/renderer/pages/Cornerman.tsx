import { useCallback, useEffect, useState } from "react";
import { CoachingCards } from "../components/CoachingCards";
import { CornermanLiveAlerts } from "../components/CornermanLiveAlerts";
import { CornermanLiveStatsTable } from "../components/CornermanLiveStats";
import { useCornermanLiveStats } from "../hooks/useCornermanLiveStats";
import { useGlobalStore } from "../stores/useGlobalStore";
import "../styles/rivals.css";

export function Cornerman({ refreshKey: _refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState<CornermanStatus | null>(null);
  const streaming = useGlobalStore((s) => s.cornermanStream);
  const isStreaming = Boolean(streaming);
  const serviceError = useGlobalStore((s) => s.cornermanError);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const liveEvents = useGlobalStore((s) => s.cornermanLiveEvents);

  const cornermanHistory = useGlobalStore((s) => s.cornermanHistory);
  const liveStats = useCornermanLiveStats();

  useEffect(() => {
    window.clippi
      .cornermanStatus()
      .then(setStatus)
      .catch(() => {});
    const offUpdate = window.clippi.onCornermanSetUpdate((s) => setStatus(s));
    return () => {
      offUpdate();
    };
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const config = await window.clippi.loadConfig();
      const folder: string | undefined = config?.replayFolder ?? undefined;
      const tag: string | undefined = config?.connectCode || config?.targetPlayer || undefined;
      if (!folder || !tag) {
        setError("Set your replay folder and player tag in Settings first.");
        return;
      }
      setStatus(await window.clippi.cornermanStart(folder, tag));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await window.clippi.cornermanStop());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const active = status?.active ?? false;
  const inSet = active && (status?.gamesCount ?? 0) > 0;

  return (
    <div>
      <div className="page-header">
        <h1>Cornerman</h1>
        <p>Live between-games coaching. Start a corner session, play — MAGI reads each game as it lands.</p>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {active ? (
          <button className="btn" onClick={stop} disabled={busy}>
            End Corner Session
          </button>
        ) : (
          <button className="btn btn-primary" onClick={start} disabled={busy}>
            Start Corner Session
          </button>
        )}
        <a className="btn" href="#/play">
          Open Play Mode
        </a>
        {inSet ? (
          <span>
            <strong>
              {status!.wins}-{status!.losses}
            </strong>{" "}
            vs <strong>{status!.opponentTag}</strong> · {status!.gamesCount} game{status!.gamesCount === 1 ? "" : "s"}
          </span>
        ) : active ? (
          <span>In your corner — waiting for the first game to finish…</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>Inactive</span>
            <span style={{ opacity: 0.7 }}>Cards are saved to your analysis history.</span>
          </div>
        )}
      </div>

      {(error || serviceError) && (
        <div className="card sessions-error" role="alert">
          {error}
        </div>
      )}

      {active && liveStats.snapshot && (
        <div className="card dossier-panel">
          <div className="dossier-panel-head">
            <h3>Live game</h3>
          </div>
          <div className="dossier-panel-body">
            <CornermanLiveStatsTable snapshot={liveStats.snapshot} />
          </div>
        </div>
      )}

      {liveEvents.length > 0 && (
        <div className="card dossier-panel">
          <div className="dossier-panel-head">
            <h3>Live alerts</h3>
          </div>
          <div className="dossier-panel-body">
            <CornermanLiveAlerts events={liveEvents} />
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="card dossier-panel">
          <div className="dossier-panel-head">
            <h3>Incoming adjustment…</h3>
          </div>
          <div className="dossier-panel-body">
            <CoachingCards text={streaming} isStreaming expandShorthand />
          </div>
        </div>
      )}

      {cornermanHistory.map((card) => (
        <div className="card dossier-panel" key={card.id}>
          <div className="dossier-panel-head">
            <h3>
              After Game {card.gameNumber} — {card.wins}-{card.losses} vs {card.opponentTag}
            </h3>
          </div>
          <div className="dossier-panel-body">
            <CoachingCards text={card.text} isStreaming={false} expandShorthand />
          </div>
        </div>
      ))}
    </div>
  );
}
