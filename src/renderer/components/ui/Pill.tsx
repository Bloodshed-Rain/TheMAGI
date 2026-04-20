import { ReactNode, ButtonHTMLAttributes } from "react";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Pill({ active, className, children, ...rest }: PillProps) {
  return (
    <button type="button" className={["pill", active ? "active" : "", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}

export function PillRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["pill-row", className].filter(Boolean).join(" ")}>{children}</div>;
}
