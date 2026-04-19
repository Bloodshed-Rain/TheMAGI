import { HTMLAttributes } from "react";

export function ResultDot({ result, ...rest }: { result: "win" | "loss" } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`result-dot ${result}`} {...rest} />;
}
