import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  sub?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, sub, cta }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h2 className="empty-state-title">{title}</h2>
      {sub && <p className="empty-state-sub">{sub}</p>}
      {cta && (
        <button className="btn btn-primary" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
