import "./IdentityCard.css";
import Markdown from "react-markdown";
import { RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { useCharacterBlurb } from "../../hooks/queries";
import { EVENT_SAMPLE_GUARDS } from "../../../characterEventProfile";
import type { CharacterBlurbResult } from "../../../characterEventProfile";
import type { CharacterModuleProps } from "./shared";
import { accentVars } from "./shared";

/** Compact relative-time caption ("just now", "14m ago", "3h ago", "6d ago"). */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

export function IdentityCard({ character, color, glowColor }: CharacterModuleProps) {
  const { data, isLoading } = useCharacterBlurb(character);
  const queryClient = useQueryClient();
  const regenerate = useMutation({
    mutationFn: () => window.clippi.analyzeCharacterBlurb(character, true),
    onSuccess: (result: CharacterBlurbResult) => {
      queryClient.setQueryData(["characterBlurb", character], result);
    },
  });

  if (!isLoading && !data) return null;

  const insufficient = data && data.insufficient ? data : null;
  const blurb = data && !data.insufficient ? data : null;

  return (
    <Card tone="chrome-plate" className="identity-card" style={accentVars(color, glowColor)}>
      <div className="identity-card-head">
        <div className="identity-card-eyebrow">AI coaching summary</div>
        <button
          type="button"
          className="identity-card-regen"
          aria-label="Refresh coaching summary"
          title="Refresh coaching summary"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending || isLoading}
        >
          <RefreshCw
            size={14}
            className={"identity-card-regen-icon" + (regenerate.isPending ? " identity-card-regen-icon--spin" : "")}
          />
        </button>
      </div>

      {isLoading && (
        <div className="identity-card-skeleton" aria-hidden="true">
          <div className="identity-card-skeleton-line" />
          <div className="identity-card-skeleton-line identity-card-skeleton-line--short" />
        </div>
      )}

      {insufficient && (
        <p className="identity-card-insufficient">
          Play at least {EVENT_SAMPLE_GUARDS.blurbGamesMin} games with {character} to get a coaching summary (
          {insufficient.gamesPlayed} played).
        </p>
      )}

      {blurb && (
        <div className={"identity-card-body" + (regenerate.isPending ? " identity-card-body--pending" : "")}>
          <div className="identity-card-blurb">
            <Markdown>{blurb.text}</Markdown>
          </div>
          <div className="identity-card-caption">
            Generated {relTime(blurb.createdAt)} · {blurb.modelUsed}
          </div>
        </div>
      )}
    </Card>
  );
}
