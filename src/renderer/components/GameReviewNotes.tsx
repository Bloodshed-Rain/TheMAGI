import { LoadError } from "./ui/LoadError";
import { useViewState } from "../hooks/useViewState";
import { FormEvent, useState } from "react";
import { ClipboardPenLine } from "lucide-react";
import { useGameReviewNotes } from "../hooks/queries";
import { Card } from "./ui/Card";

function dateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function GameReviewNotes({ gameId }: { gameId: number }) {
  const { data: notes = [], isLoading, isError, refetch } = useGameReviewNotes(gameId);
  const [content, setContent] = useViewState(`review-note-${gameId}`, "");
  const [author, setAuthor] = useState("Player");
  const [category, setCategory] = useState("review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await window.clippi.addGameReviewNote(gameId, { content, author, category });
      setContent("");
      await refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="game-review-notes-card" title="Review notes">
      <p className="game-review-notes-intro">
        Capture the decision, not just the result. Notes stay with this replay for your next review or coaching session.
      </p>
      <form className="game-review-note-form" onSubmit={submit}>
        <div className="game-review-note-meta">
          <label>
            Reviewer
            <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={80} />
          </label>
          <label>
            Type
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="review">Review</option>
              <option value="adjustment">Adjustment</option>
              <option value="question">Question</option>
              <option value="win-condition">Win condition</option>
            </select>
          </label>
        </div>
        <textarea
          aria-label="Review note"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="What happened, what was the better option, and what will you test next?"
          maxLength={4000}
          rows={4}
        />
        {error && <p className="game-review-note-error">{error}</p>}
        <button className="btn btn-primary" disabled={saving || !content.trim()}>
          <ClipboardPenLine size={13} aria-hidden="true" />
          {saving ? "Saving…" : "Save note"}
        </button>
      </form>
      {isLoading ? (
        <div className="game-review-notes-loading">Loading notes…</div>
      ) : isError ? <LoadError message="Review notes could not load." retry={() => void refetch()} /> : notes.length ? (
        <div className="game-review-notes-list">
          {notes.map((note) => (
            <article key={note.id} className="game-review-note">
              <div className="game-review-note-head">
                <strong>{note.author}</strong>
                <span>{note.category.replace("-", " ")}</span>
                <time>{dateTimeLabel(note.createdAt)}</time>
              </div>
              <p>{note.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="game-review-notes-empty">No notes yet. Start with the stock you would play differently.</p>
      )}
    </Card>
  );
}
