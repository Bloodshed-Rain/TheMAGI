import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { useOracleStore } from "../stores/useOracleStore";
import { useFollowOutput } from "../hooks/useFollowOutput";

const STARTER_PROMPTS = ["Why am I losing to Fox lately?", "Where is my edgeguard weakest?", "What's my biggest neutral leak?", "How can I convert more openings?"];
export function Oracle({ refreshKey }: { refreshKey: number }) {
  const state = useOracleStore();
  const navigate = useNavigate();
  const load = state.load;
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = !!state.requestId;
  const { unread, resume } = useFollowOutput(scrollRef, `${state.messages.length}:${state.question}:${state.response}`);
  useEffect(() => { void load(); }, [refreshKey, load]);
  return (
    <div className="oracle-page">
      <div className="page-header">
        <div><h1>MAGI Oracle</h1><p>Ask about any game, session, or pattern</p></div>
        {!!state.messages.length && <button className="btn btn-ghost" disabled={busy || state.loadingHistory} onClick={() => { if (confirm("Clear Oracle conversation history?")) void state.clear(); }}>Clear history</button>}
      </div>
      <Card className="oracle-chat-card">
        <div ref={scrollRef} className="oracle-scroll" aria-label="Oracle conversation" tabIndex={0}>
          {state.loadingHistory && <p role="status">Loading conversation…</p>}
          {!state.loadingHistory && !state.messages.length && !busy && !state.error && <EmptyState title="Ask the Oracle" sub="Choose a question or write your own below." chips={STARTER_PROMPTS.map(question => ({label: question, onClick: () => void state.ask(question)}))} />}
          {state.messages.map(message => <div key={message.id} className="oracle-row"><div className={`oracle-avatar oracle-avatar-${message.role}`} aria-label={message.role === "user" ? "You" : "Oracle"}>{message.role === "user" ? "Y" : "M"}</div><div className="oracle-body"><Markdown>{message.content}</Markdown></div></div>)}
          {busy && <><div className="oracle-row"><div className="oracle-avatar oracle-avatar-user" aria-label="You">Y</div><div className="oracle-body">{state.question}</div></div><div className="oracle-row"><div className="oracle-avatar oracle-avatar-assistant" aria-label="Oracle">M</div><div className="oracle-body"><Markdown>{state.response}</Markdown></div></div></>}
        </div>
        {unread && <button className="btn" onClick={resume}>New response · Jump to latest</button>}
        {state.status && <p role="status">{state.status}</p>}
        {state.error && <div role="alert" className="oracle-error"><p>{state.error}</p><button className="btn" disabled={busy} onClick={() => state.question ? void state.ask(state.question) : void state.load()}>Retry</button><button className="btn" onClick={() => navigate("/settings?section=ai")}>AI settings</button></div>}
        <form className="oracle-input-row" onSubmit={event => { event.preventDefault(); void state.ask(state.draft); }}>
          <textarea aria-label="Question for the Oracle" rows={3} maxLength={4000} value={state.draft} onChange={event => state.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void state.ask(state.draft); } }} placeholder="Ask about a game, matchup, or pattern…" className="oracle-input" />
          {busy ? <button type="button" className="btn" disabled={state.stopping} onClick={() => void state.stop()}>{state.stopping ? "Stopping…" : "Stop response"}</button> : <button className="btn btn-primary" disabled={!state.draft.trim() || state.loadingHistory}>Ask</button>}
        </form>
        <small>Enter to send · Shift+Enter for a new line</small>
      </Card>
    </div>
  );
}
