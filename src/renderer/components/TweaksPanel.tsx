import { useState } from "react";
import { THEMES, THEME_ORDER, applyTheme, getResolvedTheme, ColorMode } from "../themes";
import { useGlobalStore, Density } from "../stores/useGlobalStore";

const DENSITIES: Density[] = ["comfortable", "compact"];

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const colorMode = useGlobalStore((s) => s.colorMode);
  const setColorMode = useGlobalStore((s) => s.setColorMode);
  const density = useGlobalStore((s) => s.density);
  const setDensity = useGlobalStore((s) => s.setDensity);

  const onPickTheme = (id: ColorMode) => {
    setColorMode(id);
    applyTheme(getResolvedTheme(id, id));
    window.clippi.saveConfig({ colorMode: id }).catch(() => {});
  };

  const onPickDensity = (d: Density) => {
    setDensity(d);
    window.clippi.saveConfig({ density: d }).catch(() => {});
  };

  if (!open) {
    return (
      <button className="tweaks-toggle-btn" onClick={() => setOpen(true)} aria-label="Open tweaks" title="Tweaks">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="tweaks-panel" role="dialog" aria-label="Tweaks">
      <div className="tweaks-title">
        Tweaks
        <button className="tweaks-close" onClick={() => setOpen(false)} aria-label="Close tweaks">
          ×
        </button>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Theme</div>
        <div className="tweaks-row">
          {THEME_ORDER.map((id) => (
            <button
              key={id}
              className={`tweaks-chip ${colorMode === id ? "active" : ""}`}
              onClick={() => onPickTheme(id as ColorMode)}
            >
              {THEMES[id]!.name}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Density</div>
        <div className="tweaks-row">
          {DENSITIES.map((d) => (
            <button key={d} className={`tweaks-chip ${density === d ? "active" : ""}`} onClick={() => onPickDensity(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
