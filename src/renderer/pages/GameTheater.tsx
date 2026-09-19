import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useGameDetail, useGameHighlights, useStockTimeline } from "../hooks/queries";
import { useReplayPlayerStore } from "../stores/useReplayPlayerStore";
import { Badge } from "../components/ui/Badge";
import { ReplayEmbed } from "../components/ReplayEmbed";
import { GameStats } from "../components/GameStats";
import { CoachingPanel } from "../components/CoachingPanel";
import { StockTimeline, type StockTimelineData } from "../components/StockTimeline";
import { GAME_RESULT_TYPES, GameHighlightReel, type HighlightItem } from "../components/HighlightReel";
import { GameReviewNotes } from "../components/GameReviewNotes";
import { buildReplayReviewClip, type ReplayReviewMarker, type ReplaySeekRequest } from "../../replayReview";
import { timestampToFrame } from "../utils/timestampLinks";

interface CoachingEntry {
  id: number;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
  scope: string;
  title?: string | null;
}

interface GameDetailShape {
  id: number;
  replayPath: string;
  playedAt: string | null;
  stage: string;
  durationSeconds: number;
  playerCharacter: string | null;
  opponentCharacter: string;
  opponentTag: string;
  result: "win" | "loss";
  playerFinalStocks: number;
  opponentFinalStocks: number;
  analysisStatus?: string;
  analysisError?: string | null;
  statsAvailable?: boolean;
  neutralWinRate?: number | null;
  lCancelRate?: number | null;
  conversionRate?: number | null;
  avgDamagePerOpening?: number;
  openingsPerKill?: number;
  recoverySuccessRate?: number;
  avgDeathPercent?: number;
  powerShieldCount?: number;
  edgeguardSuccessRate?: number;
  totalDamageDealt?: number;
  coachingAnalyses?: CoachingEntry[];
}

export function GameTheater() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const parsed = idParam != null ? Number(idParam) : NaN;
  const gameId = Number.isFinite(parsed) ? parsed : null;

  // Set when arriving from a highlight click elsewhere in the app — the embed
  // opens directly at that moment.
  const initialSeekFrame = (location.state as { seekFrame?: number } | null)?.seekFrame;

  const closeGlobalPlayer = useReplayPlayerStore((s) => s.closePlayer);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/library");
    }
  };

  // Theater owns the embed inline — close any global overlay session so we
  // don't end up with two Dolphins fighting over focus.
  useEffect(() => {
    closeGlobalPlayer();
  }, [closeGlobalPlayer]);

  const { data, isLoading, error } = useGameDetail(gameId);
  const game = data as GameDetailShape | undefined | null;
  const { data: highlightData } = useGameHighlights(gameId);
  const { data: stockTimelineData } = useStockTimeline(game?.replayPath ?? null);
  const requestSequenceRef = useRef(0);
  const initialSeekAppliedRef = useRef<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<ReplaySeekRequest | undefined>();

  const durationFrames = useMemo(
    () => Math.max(1, Math.round((game?.durationSeconds ?? 0) * 60)),
    [game?.durationSeconds],
  );

  const reviewMarkers = useMemo<ReplayReviewMarker[]>(() => {
    const highlights = (highlightData ?? []) as HighlightItem[];
    const timeline = stockTimelineData as StockTimelineData | undefined;
    const markers: ReplayReviewMarker[] = highlights
      .filter((highlight) => !GAME_RESULT_TYPES.has(highlight.type) && highlight.startFrame > 0)
      .map((highlight) => ({
        id: `highlight-${highlight.id}`,
        frame: highlight.startFrame,
        label: highlight.label,
        kind: "highlight",
      }));

    timeline?.player.stocks.forEach((stock) => {
      const frame = timestampToFrame(stock.startTime);
      if (frame > 0) {
        markers.push({
          id: `player-stock-${stock.stockNumber}-${frame}`,
          frame,
          label: `Your stock ${stock.stockNumber}`,
          kind: "player-stock",
        });
      }
    });
    timeline?.opponent.stocks.forEach((stock) => {
      const frame = timestampToFrame(stock.startTime);
      if (frame > 0) {
        markers.push({
          id: `opponent-stock-${stock.stockNumber}-${frame}`,
          frame,
          label: `Opponent stock ${stock.stockNumber}`,
          kind: "opponent-stock",
        });
      }
    });

    return markers.sort((left, right) => left.frame - right.frame);
  }, [highlightData, stockTimelineData]);

  const handleTimestampSeek = useCallback(
    (frame: number) => {
      const clip = buildReplayReviewClip(frame, durationFrames);
      setSeekRequest({
        id: ++requestSequenceRef.current,
        frame: clip.startFrame,
        endFrame: clip.endFrame,
        label: "Review moment",
      });
    },
    [durationFrames],
  );

  useEffect(() => {
    if (!game || initialSeekFrame == null) return;
    const requestKey = `${game.id}:${initialSeekFrame}`;
    if (initialSeekAppliedRef.current === requestKey) return;
    initialSeekAppliedRef.current = requestKey;
    const clip = buildReplayReviewClip(initialSeekFrame, durationFrames);
    setSeekRequest({
      id: ++requestSequenceRef.current,
      frame: clip.startFrame,
      endFrame: clip.endFrame,
      label: "Highlight",
    });
  }, [durationFrames, game, initialSeekFrame]);

  const preloadedCoaching = useMemo(() => {
    if (!game?.coachingAnalyses?.length) return undefined;
    const gameScope = game.coachingAnalyses.find((a) => a.scope === "game");
    return gameScope?.analysisText;
  }, [game]);

  if (gameId == null) {
    return (
      <div className="theater-error">
        <p>Invalid game id.</p>
        <button className="btn" onClick={handleBack}>
          Back
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading game…
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="theater-error">
        <p>Game not found.</p>
        <button className="btn" onClick={handleBack}>
          Back
        </button>
      </div>
    );
  }

  const dur = typeof game.durationSeconds === "number" ? game.durationSeconds : 0;
  const mins = Math.floor(dur / 60);
  const secs = Math.round(dur % 60)
    .toString()
    .padStart(2, "0");

  return (
    <div className="game-theater">
      <div className="game-theater-stage-col">
        {game.replayPath ? (
          <ReplayEmbed
            replayPath={game.replayPath}
            seekRequest={seekRequest}
            durationFrames={durationFrames}
            markers={reviewMarkers}
          />
        ) : (
          <div className="theater-no-replay">
            <p>No replay file linked to this game.</p>
          </div>
        )}
      </div>

      <motion.aside className="game-theater-side-col custom-scrollbar">
        <header className="game-theater-side-head">
          <button className="btn btn-ghost game-theater-back" onClick={handleBack} aria-label="Back">
            <ChevronLeft size={16} />
            Back
          </button>
          <div className="game-theater-title-row">
            <Badge variant={game.result === "win" ? "win" : "loss"}>{game.result === "win" ? "W" : "L"}</Badge>
            <h2 className="game-theater-heading">
              {game.playerCharacter || "—"} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
              {game.opponentCharacter}
            </h2>
          </div>
          <div className="game-theater-meta">
            vs {game.opponentTag} · {game.stage} · {mins}:{secs}
          </div>
        </header>

        {game.replayPath && (
          <StockTimeline
            replayPath={game.replayPath}
            playerCharacter={game.playerCharacter || "Player"}
            opponentCharacter={game.opponentCharacter || "Opponent"}
            onSeekFrame={handleTimestampSeek}
          />
        )}

        <GameHighlightReel gameId={game.id} onSeekFrame={game.replayPath ? handleTimestampSeek : undefined} />

        <CoachingPanel
          scope="game"
          id={game.id}
          title={`${game.playerCharacter ?? "—"} vs ${game.opponentCharacter} on ${game.stage}`}
          replayPath={game.replayPath || undefined}
          preloadedText={preloadedCoaching}
          onTimestampSeek={game.replayPath ? handleTimestampSeek : undefined}
        />

        <GameReviewNotes gameId={game.id} />

        <GameStats game={game} />
      </motion.aside>
    </div>
  );
}
