import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────

interface StockData {
  stockNumber: number;
  percentLost: number;
  killMove: string | null;
  duration: number;
  openingsGiven: number;
  damageDealt: number;
  startTime: string;
  endTime: string;
}

interface StockTimelineData {
  player: {
    tag: string;
    character: string;
    stocks: StockData[];
  };
  opponent: {
    tag: string;
    character: string;
    stocks: StockData[];
  };
  gameDuration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Truncate long move names for compact display */
function shortKillMove(move: string | null): string {
  if (!move) return "";
  const abbreviations: Record<string, string> = {
    "Forward Smash": "F-Smash",
    "Up Smash": "U-Smash",
    "Down Smash": "D-Smash",
    "Forward Air": "Fair",
    "Back Air": "Bair",
    "Up Air": "Uair",
    "Down Air": "Dair",
    "Neutral Air": "Nair",
    "Forward Tilt": "F-Tilt",
    "Up Tilt": "U-Tilt",
    "Down Tilt": "D-Tilt",
    "Forward B": "Side-B",
    "Down B": "Down-B",
    "Up B": "Up-B",
    "Neutral B": "B",
  };
  return abbreviations[move] ?? move;
}

/** Map damage dealt to a 0-1 intensity value using the range across all stocks */
function computeIntensity(damageDealt: number, minDmg: number, maxDmg: number): number {
  if (maxDmg === minDmg) return 0.5;
  return Math.max(0.15, (damageDealt - minDmg) / (maxDmg - minDmg));
}

/** Detect momentum shifts: a stock where one player dealt significantly more damage */
function detectMomentumShifts(
  playerStocks: StockData[],
  opponentStocks: StockData[],
): Set<number> {
  const shifts = new Set<number>();
  // A stock where the player dealt 2x their average is a momentum spike
  const avgPlayerDmg = playerStocks.reduce((s, st) => s + st.damageDealt, 0) / (playerStocks.length || 1);
  const avgOpponentDmg = opponentStocks.reduce((s, st) => s + st.damageDealt, 0) / (opponentStocks.length || 1);

  for (const st of playerStocks) {
    if (st.damageDealt > avgPlayerDmg * 1.6 && st.damageDealt > 40) {
      shifts.add(st.stockNumber);
    }
  }
  for (const st of opponentStocks) {
    if (st.damageDealt > avgOpponentDmg * 1.6 && st.damageDealt > 40) {
      shifts.add(-st.stockNumber); // negative = opponent momentum
    }
  }
  return shifts;
}

// ── Component ────────────────────────────────────────────────────────

function StockRow({
  stocks,
  totalDuration,
  color,
  colorRgb,
  minDmg,
  maxDmg,
  isPlayer,
  momentumStocks,
}: {
  stocks: StockData[];
  totalDuration: number;
  color: string;
  colorRgb: string;
  minDmg: number;
  maxDmg: number;
  isPlayer: boolean;
  momentumStocks: Set<number>;
}) {
  return (
    <div className="stock-timeline-row">
      {stocks.map((stock, i) => {
        const widthPercent = totalDuration > 0
          ? Math.max(8, (stock.duration / totalDuration) * 100)
          : 100 / stocks.length;
        const intensity = computeIntensity(stock.damageDealt, minDmg, maxDmg);
        const hasMomentum = isPlayer
          ? momentumStocks.has(stock.stockNumber)
          : momentumStocks.has(-stock.stockNumber);
        const isDeath = stock.killMove !== null;

        return (
          <motion.div
            key={stock.stockNumber}
            className={`stock-segment ${isDeath ? "stock-dead" : "stock-alive"} ${hasMomentum ? "stock-momentum" : ""}`}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              delay: 0.08 * i + (isPlayer ? 0 : 0.04),
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              width: `${widthPercent}%`,
              transformOrigin: "left center",
              "--segment-color": color,
              "--segment-rgb": colorRgb,
              "--segment-intensity": intensity,
            } as React.CSSProperties}
            title={`Stock ${stock.stockNumber}: ${stock.damageDealt.toFixed(0)}% dealt, ${stock.percentLost.toFixed(0)}% taken${isDeath ? ` — Killed by ${stock.killMove}` : " — Survived"}`}
          >
            <div className="stock-segment-fill" />

            {/* Stock number indicator */}
            <span className="stock-segment-number">{stock.stockNumber}</span>

            {/* Damage dealt label */}
            <span className="stock-segment-dmg">
              {stock.damageDealt.toFixed(0)}%
            </span>

            {/* Kill move label at the end of each dead stock */}
            {isDeath && (
              <span className="stock-segment-kill">
                <span className="stock-kill-icon">x</span>
                <span className="stock-kill-move">{shortKillMove(stock.killMove)}</span>
                <span className="stock-kill-pct">{stock.percentLost.toFixed(0)}%</span>
              </span>
            )}

            {/* Momentum indicator */}
            {hasMomentum && (
              <div className="stock-momentum-pip" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function StockTimeline({
  replayPath,
  playerCharacter,
  opponentCharacter,
}: {
  replayPath: string;
  playerCharacter: string;
  opponentCharacter: string;
}) {
  const [data, setData] = useState<StockTimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    window.clippi.getStockTimeline(replayPath)
      .then((result: StockTimelineData) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [replayPath]);

  const analysis = useMemo(() => {
    if (!data) return null;

    const allStocks = [...data.player.stocks, ...data.opponent.stocks];
    const allDmg = allStocks.map(s => s.damageDealt);
    const minDmg = Math.min(...allDmg);
    const maxDmg = Math.max(...allDmg);
    const momentumShifts = detectMomentumShifts(data.player.stocks, data.opponent.stocks);

    return { minDmg, maxDmg, momentumShifts };
  }, [data]);

  if (loading) {
    return (
      <div className="stock-timeline-container">
        <div className="stock-timeline-loading">
          <div className="stock-timeline-loading-bar" />
        </div>
      </div>
    );
  }

  if (error || !data || !analysis) {
    return null; // Silently fail — the timeline is supplementary
  }

  return (
    <div className="stock-timeline-container">
      <div className="stock-timeline-header">
        <span className="stock-timeline-title">STOCK TIMELINE</span>
        <span className="stock-timeline-duration">
          {Math.floor(data.gameDuration / 60)}:{String(Math.floor(data.gameDuration % 60)).padStart(2, "0")}
        </span>
      </div>

      <div className="stock-timeline-chart">
        {/* Player row */}
        <div className="stock-timeline-lane">
          <span className="stock-timeline-label stock-timeline-label-player">
            {playerCharacter}
          </span>
          <StockRow
            stocks={data.player.stocks}
            totalDuration={data.gameDuration}
            color="var(--green)"
            colorRgb="var(--green-rgb)"
            minDmg={analysis.minDmg}
            maxDmg={analysis.maxDmg}
            isPlayer={true}
            momentumStocks={analysis.momentumShifts}
          />
        </div>

        {/* Divider */}
        <div className="stock-timeline-divider" />

        {/* Opponent row */}
        <div className="stock-timeline-lane">
          <span className="stock-timeline-label stock-timeline-label-opponent">
            {opponentCharacter}
          </span>
          <StockRow
            stocks={data.opponent.stocks}
            totalDuration={data.gameDuration}
            color="var(--red)"
            colorRgb="var(--red-rgb)"
            minDmg={analysis.minDmg}
            maxDmg={analysis.maxDmg}
            isPlayer={false}
            momentumStocks={analysis.momentumShifts}
          />
        </div>
      </div>
    </div>
  );
}
