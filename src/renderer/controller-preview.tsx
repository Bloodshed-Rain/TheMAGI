import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GameCubeController } from "./components/controller/GameCubeController";
import { GC_BUTTONS, type ControllerInput } from "./components/controller/controllerInput";
import "./styles/controller-preview.css";

export function ControllerPreview() {
  const [input, setInput] = useState<ControllerInput>({});
  const [surface, setSurface] = useState("dark");
  const [labels, setLabels] = useState(true);
  const [size, setSize] = useState(640);
  const [preset, setPreset] = useState("Neutral");
  const controller = useRef<HTMLDivElement>(null);
  const ink = surface === "light" ? "#26282d" : "#e8e9ec";
  function update(next: ControllerInput) {
    setInput(next);
    setPreset("Custom");
  }
  function exportSvg() {
    const svg = controller.current?.querySelector("svg");
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "themagi-gamecube-controller.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const presets: Record<string, ControllerInput> = {
    Neutral: {},
    "A + stick": { buttons: { A: true }, stick: { x: 0.7, y: 0.7 } },
    "Analog L": { triggers: { L: 0.65, R: 0 } },
    "R click + Z": { triggers: { L: 0, R: 1 }, buttons: { R: true, Z: true } },
    "C-stick + D-pad": { cStick: { x: 1, y: 0 }, buttons: { up: true } },
  };
  return (
    <main className="studio">
      <header className="studio-header">
        <a href="#" className="wordmark">
          THE<span>MAGI</span>
          <span className="wordmark-slash"> / </span>
        </a>
        <span>DESIGN LAB</span>
        <span className="header-right">
          CONTROLLER STUDY <b>01</b>
        </span>
      </header>
      <section className="studio-intro">
        <div>
          <p className="eyebrow">INPUT DISPLAY / GAMECUBE</p>
          <h1>
            Every input. <span>Nothing extra.</span>
          </h1>
          <p>A familiar silhouette. A precise signal. Built for your next set.</p>
        </div>
        <button className="export-button" onClick={exportSvg}>
          Export SVG <span aria-hidden="true">↗</span>
        </button>
      </section>
      <div className="studio-grid">
        <section className="preview-panel" aria-label="Controller preview">
          <div className="panel-top">
            <span>
              <i /> INTERACTIVE PREVIEW
            </span>
            <span>ORIGINAL LAYOUT</span>
          </div>
          <div className={`controller-stage ${surface}`}>
            <span className="stage-caption">{preset.toUpperCase()} / MANUAL INPUT</span>
            <div ref={controller} style={{ width: size, maxWidth: "100%" }}>
              <GameCubeController
                input={input}
                color={ink}
                activeLabelColor={surface === "light" ? "#fff" : "#14161a"}
                showLabels={labels}
              />
            </div>
            <span className="stage-note">TRANSPARENT SVG · 640 × 420 VIEWBOX</span>
          </div>
          <div className="preview-toolbar">
            <div className="segmented" aria-label="Preview background">
              {["dark", "grid", "light"].map((value) => (
                <button key={value} aria-pressed={surface === value} onClick={() => setSurface(value)}>
                  {value === "grid" ? "Checkerboard" : value === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
            <label className="label-toggle">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Labels
            </label>
          </div>
          <div className="preset-strip">
            <span>TRY A STATE</span>
            {Object.entries(presets).map(([name, state]) => (
              <button
                key={name}
                aria-pressed={preset === name}
                onClick={() => {
                  setInput(state);
                  setPreset(name);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
        <aside className="control-panel" aria-label="Input controls">
          <div className="control-heading">
            <h2>Input sandbox</h2>
            <button
              onClick={() => {
                setInput({});
                setPreset("Neutral");
              }}
            >
              Reset ↺
            </button>
          </div>
          <p className="helper">Toggle buttons. Move axes. See every state.</p>
          <fieldset>
            <legend>
              01 <span>BUTTONS & D-PAD</span>
            </legend>
            <div className="button-grid">
              {Object.keys(GC_BUTTONS).map((name) => {
                const key = name as keyof typeof GC_BUTTONS;
                const names: Record<string, string> = {
                  left: "←",
                  right: "→",
                  down: "↓",
                  up: "↑",
                  L: "L click",
                  R: "R click",
                };
                return (
                  <button
                    key={key}
                    aria-label={key === "L" || key === "R" ? `${key} digital click` : key}
                    aria-pressed={input.buttons?.[key] === true}
                    onClick={() => update({ ...input, buttons: { ...input.buttons, [key]: !input.buttons?.[key] } })}
                  >
                    {names[key] ?? key}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {(["stick", "cStick"] as const).map((name, i) => (
            <fieldset key={name}>
              <legend>
                0{i + 2} <span>{name === "stick" ? "CONTROL STICK" : "C-STICK"}</span>
              </legend>
              {(["x", "y"] as const).map((axis) => (
                <label className="range-row" key={axis}>
                  <span>{axis.toUpperCase()}</span>
                  <input
                    aria-label={`${name} ${axis}`}
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={input[name]?.[axis] ?? 0}
                    onChange={(e) =>
                      update({
                        ...input,
                        [name]: { x: input[name]?.x ?? 0, y: input[name]?.y ?? 0, [axis]: Number(e.target.value) },
                      })
                    }
                  />
                  <output>{(input[name]?.[axis] ?? 0).toFixed(2)}</output>
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset>
            <legend>
              04 <span>ANALOG TRIGGERS</span>
            </legend>
            {(["L", "R"] as const).map((key) => (
              <label className="range-row" key={key}>
                <span>{key}</span>
                <input
                  aria-label={`${key} analog trigger`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={input.triggers?.[key] ?? 0}
                  onChange={(e) =>
                    update({
                      ...input,
                      triggers: { L: input.triggers?.L ?? 0, R: input.triggers?.R ?? 0, [key]: Number(e.target.value) },
                    })
                  }
                />
                <output>{Math.round((input.triggers?.[key] ?? 0) * 100)}%</output>
              </label>
            ))}
            <p className="helper">Travel and digital clicks are independent.</p>
          </fieldset>
        </aside>
      </div>
      <footer className="studio-footer">
        <div>
          <span className="eyebrow">SCALES WITH YOUR SETUP</span>
          <p>One outline. Any canvas.</p>
        </div>
        <label className="size-control">
          Preview width{" "}
          <input
            aria-label="Preview width"
            type="range"
            min="240"
            max="720"
            step="10"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <output>{size} px</output>
        </label>
        <span className="footer-note">MONOCHROME / NO BACKGROUND / FRAME-DRIVEN</span>
      </footer>
      <p className="integration-note">
        Manual preview · No controller connected. The component accepts normalized controller events or Slippi pre-frame
        data through the included adapter.
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControllerPreview />
  </StrictMode>,
);
