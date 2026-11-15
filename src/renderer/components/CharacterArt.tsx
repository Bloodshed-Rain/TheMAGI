import type { CSSProperties } from "react";
import { CHARACTER_IMAGE_URLS } from "../characterMeta";

/** Character wireframe art: the image is a mask over a flat color (falls back to nothing when a character has no art). */
export function CharacterCardImage({
  character,
  variant = "bg",
  color,
  idle = false,
  scanColor,
}: {
  character: string;
  variant?: "bg" | "portrait";
  color?: string;
  /**
   * Wireframe idle: a ring of color radiates out through the wires (always on for the
   * hero portrait, on hover for a tile). Needs a positioned parent, which the
   * hero stage and the character tiles are.
   */
  idle?: boolean;
  /** Color of the ring's leading edge; defaults to white (dark text in Light). */
  scanColor?: string;
}) {
  const src = CHARACTER_IMAGE_URLS[character];
  if (!src) return null;
  const className = variant === "portrait" ? "char-hero-portrait" : "char-card-bg-img";
  const mask: CSSProperties = { WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` };
  return (
    <>
      <div className={className} style={{ ...mask, backgroundColor: color ?? "var(--text)" }} aria-hidden />
      {idle && (
        // The art is a mask over a flat color, so color painted behind the same
        // mask only shows on the wires. It is a separate layer so the glow
        // filter on the art above is not redrawn on every frame of the sweep.
        <div
          className={`wire-scan-mask wire-scan-mask--${variant}`}
          style={{ ...mask, ...(scanColor ? { "--wire-scan": scanColor } : {}) } as CSSProperties}
          aria-hidden
        >
          <span className="wire-scan" />
        </div>
      )}
    </>
  );
}
