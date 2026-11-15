import { ReactNode, ButtonHTMLAttributes, createContext, useContext, useId } from "react";
import { motion } from "framer-motion";
import { DURATION_MS, EASE, seconds } from "../../motion";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/** Set by a tracked PillRow: the layoutId its active pill's thumb shares. */
const PillThumbContext = createContext<string | null>(null);

export function Pill({ active, className, children, ...rest }: PillProps) {
  const thumbId = useContext(PillThumbContext);
  const tracked = thumbId != null;
  return (
    <button
      type="button"
      aria-pressed={active ?? false}
      className={["pill", active ? "active" : "", tracked ? "has-thumb" : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {tracked && active && (
        <motion.span
          layoutId={thumbId}
          className="pill-thumb"
          aria-hidden="true"
          // Radius goes through framer so it stays round while the thumb is scaled between pills.
          style={{ borderRadius: 999 }}
          transition={{ duration: seconds(DURATION_MS.moderate), ease: EASE.spring }}
        />
      )}
      {children}
    </button>
  );
}

interface PillRowProps {
  children: ReactNode;
  className?: string;
  /**
   * Pick-one rows (the default): the active fill is one thumb that glides to
   * the chosen pill. Pass `track={false}` for a row where several pills can be
   * active at once; each pill then paints its own active state.
   */
  track?: boolean;
}

export function PillRow({ children, className, track = true }: PillRowProps) {
  const id = useId();
  return (
    <PillThumbContext.Provider value={track ? `pill-thumb-${id}` : null}>
      <div className={["pill-row", className].filter(Boolean).join(" ")}>{children}</div>
    </PillThumbContext.Provider>
  );
}
