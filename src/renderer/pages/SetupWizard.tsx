import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, FolderOpen, Gamepad2, Sparkles } from "lucide-react";
import type { SetupStatus } from "../../setupStatus";
import "../styles/setup.css";

const STEPS = ["Your player", "Your replays", "Play & review", "Ready to go"];
type Draft = {
  targetPlayer: string;
  connectCode: string;
  replayFolder: string;
  dolphinPath: string;
  playDolphinPath: string;
  meleeIsoPath: string;
};
const EMPTY: Draft = {
  targetPlayer: "",
  connectCode: "",
  replayFolder: "",
  dolphinPath: "",
  playDolphinPath: "",
  meleeIsoPath: "",
};

export function SetupWizard({ onImport }: { onImport: () => void }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [progress, setProgress] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [config, checks] = await Promise.all([window.clippi.loadConfig(), window.clippi.setupStatus()]);
        if (cancelled) return;
        const next = { ...EMPTY };
        for (const key of Object.keys(next) as (keyof Draft)[]) next[key] = config[key] || "";
        next.replayFolder ||= checks.replays.ready ? checks.replays.path || "" : "";
        next.dolphinPath ||= checks.playback.ready ? checks.playback.path || "" : "";
        next.playDolphinPath ||= checks.netplay.ready ? checks.netplay.path || "" : "";
        next.meleeIsoPath ||= checks.melee.ready ? checks.melee.path || "" : "";
        setDraft(next);
        setStatus(checks);
        setStep(Math.min(3, Math.max(0, Number(config.setupWizardStep) || 0)));
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step, loaded]);
  useEffect(
    () =>
      window.clippi.onImportProgress((p) => {
        setProgress(`${p.current} of ${p.total} replays checked · ${p.importedSoFar} imported`);
      }),
    [],
  );

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (nextStep = step) => {
    await window.clippi.saveConfig({
      ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() || null])),
      setupWizardStep: nextStep,
    });
  };
  const refresh = async () => {
    await save();
    const checks = await window.clippi.setupStatus();
    setStatus(checks);
    return checks;
  };
  const next = () =>
    run(async () => {
      if (step === 0 && !(draft.connectCode.trim() || draft.targetPlayer.trim()))
        throw new Error("Enter your connect code or player tag so MAGI can find you in replays.");
      await save(step + 1);
      setStep(step + 1);
      setNotice("");
      setStatus(await window.clippi.setupStatus());
    });
  const choose = (key: keyof Draft, folder = false) =>
    run(async () => {
      const selected = folder
        ? await window.clippi.openFolder()
        : await window.clippi.openFileDialog(
            key === "meleeIsoPath" ? "Choose your Melee game image" : "Choose Slippi Dolphin",
            [
              {
                name: key === "meleeIsoPath" ? "Game image" : "Dolphin executable",
                extensions: key === "meleeIsoPath" ? ["iso", "gcm", "rvz"] : ["exe", "AppImage", "*"],
              },
            ],
          );
      if (selected) {
        setDraft((d) => ({ ...d, [key]: selected }));
        setNotice("Selection updated. Use Check setup to verify it.");
      }
    });
  const finish = (destination: string) =>
    run(async () => {
      await save();
      await window.clippi.saveConfig({ setupCompletedAt: new Date().toISOString(), setupDeferred: false });
      navigate(destination);
    });
  const field = (key: keyof Draft, label: string, help: string, folder = false) => (
    <div className="settings-field">
      <label htmlFor={`setup-${key}`}>{label}</label>
      <div className="setup-path">
        <input
          id={`setup-${key}`}
          value={draft[key]}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder="Choose a location"
        />
        <button
          className="btn"
          disabled={busy}
          onClick={() => void choose(key, folder)}
          aria-label={`Browse for ${label}`}
        >
          <FolderOpen size={14} /> Browse
        </button>
      </div>
      <small>{help}</small>
    </div>
  );
  return (
    <div className="setup-page">
      <div className="setup-intro">
        <span className="setup-eyebrow">WELCOME TO MAGI</span>
        <h1>Your game. Your corner.</h1>
        <p>Set up the essentials once. Add coaching and playback whenever you like.</p>
      </div>
      <ol className="setup-steps" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <span>{i < step ? <CheckCircle2 size={16} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <section className="card setup-card" aria-busy={busy}>
        <h2 ref={heading} tabIndex={-1}>
          {STEPS[step]}
        </h2>
        {!loaded ? (
          <p>
            {error ? "Setup could not load. Reopen it from Settings to try again." : "Checking your saved settings…"}
          </p>
        ) : (
          <>
            {step === 0 && (
              <>
                <p>
                  Tell MAGI which player is you. Your Slippi connect code is the most reliable way to match your games.
                </p>
                <div className="settings-field">
                  <label htmlFor="setup-code">Slippi connect code</label>
                  <input
                    id="setup-code"
                    autoComplete="off"
                    placeholder="TAG#123"
                    value={draft.connectCode}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, connectCode: e.target.value })}
                  />
                  <small>Find this in Slippi’s online menu. Keep the # and numbers.</small>
                </div>
                <div className="settings-field">
                  <label htmlFor="setup-tag">
                    Player tag {draft.connectCode.trim() ? "(optional)" : "(use this for offline replays)"}
                  </label>
                  <input
                    id="setup-tag"
                    placeholder="Your in-game name"
                    value={draft.targetPlayer}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, targetPlayer: e.target.value })}
                  />
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <p>
                  Choose the folder where Slippi saves your .slp replays. MAGI includes subfolders and skips files
                  already imported.
                </p>
                {field(
                  "replayFolder",
                  "Replay folder",
                  "Find the replay location in Slippi Launcher or Dolphin’s replay settings. No games yet? You can import later.",
                  true,
                )}
                <div className="setup-actions">
                  <button
                    className="btn"
                    disabled={busy || !draft.replayFolder.trim()}
                    onClick={() =>
                      void run(async () => {
                        const checks = await refresh();
                        setNotice(checks.replays.message);
                      })
                    }
                  >
                    Check folder
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !draft.replayFolder.trim()}
                    onClick={() =>
                      void run(async () => {
                        setNotice("");
                        setProgress("Looking for replay files…");
                        try {
                          const checks = await refresh();
                          if (!checks.replays.ready) throw new Error(checks.replays.message);
                          const result = await window.clippi.importFolder(
                            draft.replayFolder.trim(),
                            draft.connectCode.trim() || draft.targetPlayer.trim(),
                          );
                          setNotice(
                            `${result.imported} imported · ${result.skipped} skipped · ${result.errors} failed.${result.unreadableDirs ? " Some subfolders could not be read. Check folder permissions." : ""}${result.errors ? " Open Settings → Replays to retry and inspect errors." : ""}`,
                          );
                          onImport();
                        } finally {
                          setProgress("");
                        }
                      })
                    }
                  >
                    {busy ? "Working…" : "Import my replays"}
                  </button>
                </div>
                <p className="setup-hint">
                  Imports stay on your computer. This step does not send replays to an AI provider.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  Optional. Install Slippi Launcher first, then choose your own Melee game image. Common locations are
                  filled in when detected.
                </p>
                {status?.platform === "win32" ? (
                  field(
                    "playDolphinPath",
                    "Netplay Dolphin",
                    "Used for live games in Play Mode. Choose the netplay copy, not Playback Dolphin.",
                  )
                ) : (
                  <p className="setup-hint">
                    Hosted Play Mode currently requires Windows. Replay analysis remains available here.
                  </p>
                )}
                {field(
                  "dolphinPath",
                  "Playback Dolphin",
                  "Used to review saved games in Game Theater. Slippi Launcher installs a separate playback copy.",
                )}
                {field(
                  "meleeIsoPath",
                  "Melee game image",
                  "Choose your legally obtained Melee image. MAGI does not include the game.",
                )}
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await refresh();
                      setNotice("Paths checked below. Launching a game is the final compatibility check.");
                    })
                  }
                >
                  Check setup
                </button>
                <ul className="setup-checks">
                  {status &&
                    [status.playback, ...(status.platform === "win32" ? [status.netplay] : []), status.melee].map(
                      (check, i) => (
                        <li key={i}>
                          {["Playback", ...(status.platform === "win32" ? ["Netplay"] : []), "Game image"][i]}:{" "}
                          {check.ready ? "Found" : check.message}
                        </li>
                      ),
                    )}
                </ul>
                {status?.replaySavingEnabled === false && (
                  <p role="alert">
                    Slippi replay saving is disabled. Enable Save replays in Dolphin to use live stats and Cornerman.
                  </p>
                )}
                <p className="setup-hint">
                  Configure your controller in Dolphin before your first game. Playback and Play Mode can be set up
                  later.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <p>
                  You can start exploring now. Replay analysis, stats, notes, and Play Mode do not need an AI
                  subscription or API key.
                </p>
                <ul className="setup-checks">
                  <li>Player: {draft.connectCode || draft.targetPlayer || "Not set"}</li>
                  <li>
                    Replays:{" "}
                    {status?.replays.ready
                      ? "Folder is readable — import now or later"
                      : "Choose a folder when you have games"}
                  </li>
                  <li>
                    Game review:{" "}
                    {status?.playback.ready && status?.melee.ready
                      ? "Files found — ready to try playback"
                      : "Optional setup available in Settings → Playback"}
                  </li>
                </ul>
                <div className="setup-destinations">
                  <button className="btn btn-primary" disabled={busy} onClick={() => void finish("/dashboard")}>
                    <ArrowRight size={16} /> Open Dashboard
                  </button>
                  {status?.platform === "win32" && (
                    <button className="btn" disabled={busy} onClick={() => void finish("/play")}>
                      <Gamepad2 size={16} /> Open Play Mode
                    </button>
                  )}
                  <button className="btn" disabled={busy} onClick={() => void finish("/settings")}>
                    <Sparkles size={16} /> Set up AI coaching
                  </button>
                </div>
                <p className="setup-hint">
                  AI coaching is optional. Choose a provider and model in Settings → AI. Hosted providers receive the
                  game context needed for your request. Provider access and limits vary.
                </p>
                <p className="setup-hint">
                  For automatic imports, enable Watch for New Games in Settings → Replays. Reopen this guide anytime
                  with Setup wizard in Settings.
                </p>
              </>
            )}
          </>
        )}
        {progress && <p role="status">{progress}</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        <footer className="setup-footer">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (loaded) await save();
                await window.clippi.saveConfig({ setupDeferred: true });
                navigate("/dashboard");
              })
            }
          >
            Finish later
          </button>
          <div>
            {step > 0 && (
              <button
                className="btn"
                disabled={busy || !loaded}
                onClick={() => {
                  setStep(step - 1);
                  setNotice("");
                  setError("");
                }}
              >
                Back
              </button>
            )}
            {step < 3 && (
              <button className="btn btn-primary" disabled={busy || !loaded} onClick={() => void next()}>
                {step === 2 ? "Continue without launching" : "Continue"} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
