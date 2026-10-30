import "./TriviaCard.css";
import type { CharacterTrivia } from "../../../characterEventProfile";
import { Card } from "../../components/ui/Card";
import { useCharacterEventProfile } from "../../hooks/queries";
import { accentVars, fmtDuration, type CharacterModuleProps } from "./shared";

interface FactTile {
  key: string;
  value: string;
  caption: string;
  sub?: string;
  tone?: "green" | "red";
}

function buildTiles(trivia: CharacterTrivia, character: string): FactTile[] {
  const tiles: FactTile[] = [];

  if (trivia.totalPlaytimeSeconds > 0) {
    tiles.push({
      key: "playtime",
      value: fmtDuration(trivia.totalPlaytimeSeconds),
      caption: `played as ${character}.`,
    });
  }

  if (trivia.totalDamageDealt > 0) {
    const total = Math.round(trivia.totalDamageDealt);
    tiles.push({
      key: "damage",
      value: `${total.toLocaleString()}%`,
      caption: "damage dealt.",
      sub: `≈ ${Math.round(total / 999).toLocaleString()} Sandbags cleared`,
    });
  }

  if (trivia.airtimeSeconds > 0) {
    tiles.push({
      key: "airtime",
      value: fmtDuration(trivia.airtimeSeconds),
      caption: "spent in the air.",
    });
  }

  if (trivia.totalWavedashes > 0) {
    tiles.push({
      key: "wavedashes",
      value: trivia.totalWavedashes.toLocaleString(),
      caption: "wavedashes.",
    });
  }

  if (trivia.sdCount > 0) {
    tiles.push({
      key: "sds",
      value: trivia.sdCount.toLocaleString(),
      caption: "self-destructs.",
      tone: "red",
    });
  }

  if (trivia.fourStockWins > 0) {
    tiles.push({
      key: "four-stocks",
      value: trivia.fourStockWins.toLocaleString(),
      caption: "wins without losing a stock.",
      tone: "green",
    });
  }

  if (trivia.longestGameSeconds != null && trivia.longestGameSeconds > 0) {
    tiles.push({
      key: "longest",
      value: fmtDuration(trivia.longestGameSeconds),
      caption: "longest game.",
    });
  }

  return tiles;
}

export function TriviaCard({ character, color, glowColor }: CharacterModuleProps) {
  const { data: profile } = useCharacterEventProfile(character);

  if (!profile) return null;

  const trivia = profile.trivia;
  if (trivia.totalPlaytimeSeconds === 0) return null;

  const tiles = buildTiles(trivia, character);
  if (tiles.length === 0) return null;

  return (
    <Card title="Lifetime totals" className="trivia-card" style={accentVars(color, glowColor)}>
      <div className="trivia-card-grid">
        {tiles.map((tile) => (
          <div key={tile.key} className="trivia-card-tile">
            <div className={["trivia-card-value", tile.tone ? `trivia-card-value-${tile.tone}` : ""].join(" ").trim()}>
              {tile.value}
            </div>
            {tile.sub && <div className="trivia-card-sub">{tile.sub}</div>}
            <div className="trivia-card-caption">{tile.caption}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
