import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  sub?: string;
  cta?: {
    label: string;
    onClick: () => void; disabled?: boolean;
  };
  /** Optional one-tap starter actions rendered as a row of chips (e.g. Oracle prompts). */
  chips?: { label: string; onClick: () => void }[];
}

export function EmptyState({ icon, title, sub, cta, chips }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h2 className="empty-state-title">{title}</h2>
      {sub && <p className="empty-state-sub">{sub}</p>}
      {chips && chips.length > 0 && (
        <div className="empty-state-chips">
          {chips.map((c) => (
            <button key={c.label} type="button" className="empty-state-chip" onClick={c.onClick}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {cta && (
        <button className="btn btn-primary" onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
