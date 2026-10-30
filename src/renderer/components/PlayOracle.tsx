import { useEffect, useState } from "react";
import Markdown from "react-markdown";

export function PlayOracle() {
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof window.clippi.oracleListMessages>>>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void window.clippi
      .oracleListMessages()
      .then(setMessages)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <div className="play-oracle">
      <div className="play-conversation" aria-live="polite">
        {!messages.length && (
          <p className="helper-text">Ask about your recent games, a matchup, or your next adjustment.</p>
        )}
        {messages.slice(-8).map((message) => (
          <article className="analysis-text" key={message.id}>
            <small>{message.role === "user" ? "You" : "MAGI"}</small>
            <Markdown>{message.content}</Markdown>
          </article>
        ))}
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !question.trim()) return;
          setBusy(true);
          setError(null);
          try {
            const result = await window.clippi.oracleAsk(question.trim());
            setMessages((previous) => [...previous, result.user, result.assistant]);
            setQuestion("");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="form-field">
          Ask the Oracle
          <textarea
            rows={3}
            value={question}
            maxLength={4000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What should I focus on next?"
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !question.trim()}>
          {busy ? "Thinking…" : "Ask MAGI"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
