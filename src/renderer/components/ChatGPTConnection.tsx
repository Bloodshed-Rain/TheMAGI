import { useEffect, useState } from "react";
import type { ChatGPTStatus, ChatGPTModel } from "../../chatgptTypes";

export function ChatGPTConnection({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [status, setStatus] = useState<ChatGPTStatus | null>(null);
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = async () => {
    const next = await window.clippi.chatgptStatus();
    setStatus(next);
    const config = await window.clippi.loadConfig();
    setActive(config.activeProvider === "chatgpt");
    setSelectedModel(config.modelByProvider?.chatgpt || "");
    setModels(next.sharing ? await window.clippi.chatgptModels() : []);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await action();
      await refresh();
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chatgpt-connection">
      <p>
        {status?.sharing
          ? active
            ? "Using ChatGPT plan for AI analysis"
            : "ChatGPT plan connected"
          : "Connect ChatGPT for AI analysis. Eligible plans can authorize usage without an API key."}
      </p>
      <p className="helper-text">
        Live stats and replay importing do not require ChatGPT. This connection does not give MAGI access to your
        ChatGPT conversations.
      </p>
      {!!status?.profiles.length && (
        <label className="form-field">
          ChatGPT account
          <select
            value={status.activeProfileId || ""}
            disabled={busy}
            onChange={(event) => void run(() => window.clippi.chatgptSelect(event.target.value))}
          >
            <option value="" disabled>
              Choose a connection
            </option>
            {status.profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.label}
                {profile.connected ? "" : " · signed out"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="settings-row settings-wrap-row">
        {(!status?.connected || !status.sharing) && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(() => window.clippi.chatgptConnect(status?.connected ? { requestConsent: true } : {}))
            }
          >
            {busy
              ? "Complete sign-in in your browser…"
              : status?.connected
                ? "Enable ChatGPT plan usage"
                : "Continue with ChatGPT"}
          </button>
        )}
        {busy && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              void window.clippi.chatgptCancel().catch((e) => setError(String(e)));
            }}
          >
            Cancel sign-in
          </button>
        )}
        {status?.connected && (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void run(() => window.clippi.chatgptConnect({ newProfile: true }))}
            >
              Add account
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.clippi.chatgptDisconnect();
                  if (!result.remoteRevoked)
                    setNotice(
                      "Signed out locally. Remote revocation was not confirmed; disconnect MAGI in ChatGPT Settings → Usage if needed.",
                    );
                })
              }
            >
              Disconnect
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void window.clippi.chatgptUsage().catch((e) => setError(String(e)));
              }}
            >
              Manage usage
            </button>
          </>
        )}
      </div>
      {status?.sharing && (
        <label className="form-field">
          Analysis model
          <select
            disabled={busy || !models.length}
            value={selectedModel}
            onChange={(event) => {
              const model = event.target.value;
              void run(async () => {
                await window.clippi.saveConfig({ activeProvider: "chatgpt", modelByProvider: { chatgpt: model } });
              });
            }}
          >
            <option value="">Select an available model</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {status?.sharing && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(refresh)}>
          Refresh connection & models
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
