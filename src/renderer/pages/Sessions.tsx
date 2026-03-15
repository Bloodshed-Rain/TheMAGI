import { useEffect, useState } from "react";

interface DetectedSet {
  opponentTag: string;
  opponentCharacter: string;
  gameIds: number[];
  startedAt: string;
  wins: number;
  losses: number;
}

type View = "sets" | "opponents";

interface OpponentRecord {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  characters: string;
  lastPlayed: string | null;
}

export function Sessions({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<View>("sets");
  const [sets, setSets] = useState<DetectedSet[]>([]);
  const [opponents, setOpponents] = useState<OpponentRecord[]>([]);
  const [opponentSearch, setOpponentSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, o] = await Promise.all([
          window.clippi.getSets(),
          window.clippi.getOpponents(),
        ]);
        setSets(s);
        setOpponents(o);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  const handleSearch = async () => {
    if (!opponentSearch.trim()) {
      const o = await window.clippi.getOpponents();
      setOpponents(o);
    } else {
      const o = await window.clippi.getOpponents(opponentSearch.trim());
      setOpponents(o);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  if (sets.length === 0 && opponents.length === 0) {
    return (
      <div className="empty-state">
        <h2>No sessions yet</h2>
        <p>Import replays to see your sets and opponent history.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>{sets.length} sets detected, {opponents.length} unique opponents</p>
      </div>

      <div className="tab-bar">
        {(["sets", "opponents"] as View[]).map((v) => (
          <button
            key={v}
            className={`tab ${view === v ? "active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "sets" ? "Sets" : "Opponents"}
          </button>
        ))}
      </div>

      {/* Sets view */}
      {view === "sets" && (
        <div className="card">
          {sets.length === 0 ? (
            <p style={{ color: "var(--text-dim)" }}>No sets detected yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Character</th>
                  <th>Games</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {[...sets].reverse().map((set, i) => {
                  const total = set.wins + set.losses;
                  const result = set.wins > set.losses ? "W" : set.losses > set.wins ? "L" : "T";
                  return (
                    <tr key={i}>
                      <td>{new Date(set.startedAt).toLocaleDateString()}</td>
                      <td>{set.opponentTag}</td>
                      <td>{set.opponentCharacter}</td>
                      <td>{total}</td>
                      <td>
                        <span className="record-win">{set.wins}</span>
                        {" - "}
                        <span className="record-loss">{set.losses}</span>
                      </td>
                      <td className={result === "W" ? "record-win" : result === "L" ? "record-loss" : ""}>
                        {result}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Opponents view */}
      {view === "opponents" && (
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="settings-row">
              <input
                value={opponentSearch}
                onChange={(e) => setOpponentSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by tag or connect code..."
              />
              <button className="btn" onClick={handleSearch}>Search</button>
            </div>
          </div>
          <div className="card">
            {opponents.length === 0 ? (
              <p style={{ color: "var(--text-dim)" }}>No opponents found.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Opponent</th>
                    <th>Code</th>
                    <th>Characters</th>
                    <th>Games</th>
                    <th>Record</th>
                    <th>Win Rate</th>
                    <th>Last Played</th>
                  </tr>
                </thead>
                <tbody>
                  {opponents.map((o, i) => (
                    <tr key={i}>
                      <td>{o.opponentTag}</td>
                      <td style={{ color: "var(--text-dim)" }}>{o.opponentConnectCode ?? ""}</td>
                      <td>{o.characters}</td>
                      <td>{o.totalGames}</td>
                      <td>
                        <span className="record-win">{o.wins}</span>
                        {" - "}
                        <span className="record-loss">{o.losses}</span>
                      </td>
                      <td>{(o.winRate * 100).toFixed(0)}%</td>
                      <td>{o.lastPlayed ? new Date(o.lastPlayed).toLocaleDateString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
