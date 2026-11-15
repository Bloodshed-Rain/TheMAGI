import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WireframeController } from "./components/controller/WireframeController";
import { GC_BUTTONS, type ControllerButton, type ControllerInput } from "./components/controller/controllerInput";

// Development sandbox for the wireframe input display. Not part of the app
// bundle: Vite only builds index.html.
const BUTTONS = Object.keys(GC_BUTTONS) as ControllerButton[];
const ALL: ControllerInput = {
  buttons: Object.fromEntries(BUTTONS.map((button) => [button, true])),
  stick: { x: 0, y: 1 },
  cStick: { x: 1, y: 0 },
  triggers: { L: 1, R: 1 },
};

/** A scripted loop that touches every control, for watching the display move. */
function demoFrame(frame: number): ControllerInput {
  const t = frame / 60;
  const step = Math.floor(frame / 20) % BUTTONS.length;
  return {
    buttons: { [BUTTONS[step]!]: frame % 20 < 8 },
    stick: { x: Math.cos(t * 2), y: Math.sin(t * 2) },
    cStick: frame % 90 < 12 ? { x: 0, y: -1 } : { x: 0, y: 0 },
    triggers: { L: (Math.sin(t) + 1) / 2, R: 0 },
  };
}

// A page entry point, not a module other files import: there is nothing to export.
// eslint-disable-next-line react-refresh/only-export-components
function Preview() {
  const [input, setInput] = useState<ControllerInput>({});
  const [mode, setMode] = useState<"manual" | "all" | "demo">("manual");
  const [regions, setRegions] = useState(false);
  const [width, setWidth] = useState(720);
  const [afterglow, setAfterglow] = useState(110);
  useEffect(() => {
    if (mode !== "demo") return;
    let frame = 0;
    let raf = 0;
    const tick = () => {
      setInput(demoFrame(frame++));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  const shown = mode === "all" ? ALL : input;
  const axis = (name: "stick" | "cStick", key: "x" | "y") => (
    <label>
      {name} {key}
      <input
        type="range"
        min={-1}
        max={1}
        step={0.0125}
        value={input[name]?.[key] ?? 0}
        onChange={(event) =>
          setInput((current) => ({
            ...current,
            [name]: { x: 0, y: 0, ...current[name], [key]: Number(event.target.value) },
          }))
        }
      />
    </label>
  );
  return (
    <main style={{ minHeight: "100vh", background: "#000", color: "#cfd3da", font: "13px system-ui", padding: 20 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {(["manual", "all", "demo"] as const).map((value) => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value === "manual" ? "Manual" : value === "all" ? "Everything on" : "Demo loop"}
          </button>
        ))}
        <button onClick={() => setInput({})}>Clear</button>
        <label>
          <input type="checkbox" checked={regions} onChange={(event) => setRegions(event.target.checked)} /> Regions
        </label>
        <label>
          Width {width}px
          <input
            type="range"
            min={200}
            max={1200}
            step={10}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <label>
          Afterglow {afterglow}ms
          <input
            type="range"
            min={0}
            max={400}
            step={10}
            value={afterglow}
            onChange={(event) => setAfterglow(Number(event.target.value))}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {BUTTONS.map((button) => (
          <button
            key={button}
            data-button={button}
            aria-pressed={input.buttons?.[button] === true}
            onClick={() =>
              setInput((current) => ({
                ...current,
                buttons: { ...current.buttons, [button]: !current.buttons?.[button] },
              }))
            }
          >
            {button}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        {axis("stick", "x")}
        {axis("stick", "y")}
        {axis("cStick", "x")}
        {axis("cStick", "y")}
        {(["L", "R"] as const).map((side) => (
          <label key={side}>
            {side} analog
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={input.triggers?.[side] ?? 0}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  triggers: { L: 0, R: 0, ...current.triggers, [side]: Number(event.target.value) },
                }))
              }
            />
          </label>
        ))}
      </div>
      <div style={{ width }}>
        <WireframeController input={shown} showRegions={regions} afterglowMs={afterglow} />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
