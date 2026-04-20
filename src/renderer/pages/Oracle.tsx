import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function Oracle({ refreshKey: _ }: { refreshKey: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.clippi.oracleListMessages().then(setMsgs);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, loading]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setErr(null);
    setInput("");
    try {
      const { user, assistant } = await window.clippi.oracleAsk(text);
      setMsgs((m) => [...m, user, assistant]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    if (!confirm("Clear Oracle conversation history?")) return;
    await window.clippi.oracleClear();
    setMsgs([]);
  };

  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h1>MAGI Oracle</h1>
          <p>Ask about any game, session, or pattern</p>
        </div>
        {msgs.length > 0 && (
          <button className="btn btn-ghost" onClick={clear}>
            Clear history
          </button>
        )}
      </div>
      <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        <div className="oracle-scroll">
          {msgs.length === 0 && !loading && (
            <EmptyState
              title="Ask the Oracle"
              sub="Try: 'Why am I losing to Fox lately?' or 'Where is my edgeguard weakest?'"
            />
          )}
          {msgs.map((m) => (
            <div key={m.id} className="oracle-row">
              <div className={`oracle-avatar oracle-avatar-${m.role}`}>{m.role === "user" ? "Y" : "M"}</div>
              <div className="oracle-body">
                <Markdown>{m.content}</Markdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="oracle-row">
              <div className="oracle-avatar oracle-avatar-assistant">M</div>
              <div className="oracle-body">
                <em style={{ color: "var(--text-muted)" }}>Thinking…</em>
              </div>
            </div>
          )}
          {err && <p style={{ color: "var(--loss)" }}>{err}</p>}
          <div ref={endRef} />
        </div>
        <div className="oracle-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about a game, matchup, or pattern…"
            disabled={loading}
            className="oracle-input"
          />
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            Ask
          </button>
        </div>
      </Card>
    </div>
  );
}
