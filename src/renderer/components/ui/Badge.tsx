import { ReactNode } from "react";

type Variant = "win" | "loss" | "neutral";

export function Badge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
