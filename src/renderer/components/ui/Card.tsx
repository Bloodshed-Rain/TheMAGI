import { ReactNode, HTMLAttributes } from "react";

type CardTone = "default" | "chrome-plate";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  title?: string;
  children: ReactNode;
}

export function Card({ tone = "default", title, className, children, ...rest }: CardProps) {
  const toneClass = tone === "chrome-plate" ? "chrome-plate" : "";
  return (
    <div className={["card", toneClass, className].filter(Boolean).join(" ")} {...rest}>
      {title && <div className="card-title">{title}</div>}
      {children}
    </div>
  );
}
