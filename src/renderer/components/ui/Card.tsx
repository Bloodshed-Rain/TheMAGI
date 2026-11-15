import type { PointerEvent, ReactNode } from "react";
import { motion, useReducedMotion, useSpring, type HTMLMotionProps, type MotionStyle } from "framer-motion";
import { specularFromPointer, tiltLimitForSize } from "./specular";

type CardTone = "default" | "chrome-plate";

interface CardProps extends HTMLMotionProps<"div"> {
  tone?: CardTone;
  title?: string;
  /**
   * Lead cards only (two or three per page): a light follows the pointer across
   * the plate and the card tilts toward it: up to 3°, less for large cards.
   * Under reduced motion the light still tracks; the tilt is skipped.
   */
  specular?: boolean;
  children: ReactNode;
}

const TILT_SPRING = { stiffness: 260, damping: 26, mass: 0.6 };

export function Card({
  tone = "default",
  title,
  specular = false,
  className,
  children,
  style,
  onPointerMove,
  onPointerLeave,
  ...rest
}: CardProps) {
  const reduceMotion = useReducedMotion();
  const rotateX = useSpring(0, TILT_SPRING);
  const rotateY = useSpring(0, TILT_SPRING);
  const tilt = specular && !reduceMotion;

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (specular) {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const s = specularFromPointer(
        rect.width,
        rect.height,
        e.clientX - rect.left,
        e.clientY - rect.top,
        tiltLimitForSize(rect.width, rect.height),
      );
      el.style.setProperty("--mx", `${s.mx}px`);
      el.style.setProperty("--my", `${s.my}px`);
      if (tilt) {
        rotateX.set(s.rotateX);
        rotateY.set(s.rotateY);
      }
    }
    onPointerMove?.(e);
  };
  const handlePointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (specular) {
      rotateX.set(0);
      rotateY.set(0);
    }
    onPointerLeave?.(e);
  };

  const mergedStyle: MotionStyle | undefined = tilt ? { ...style, rotateX, rotateY, transformPerspective: 900 } : style;
  const toneClass = tone === "chrome-plate" ? "chrome-plate" : "";
  return (
    <motion.div
      className={["card", toneClass, specular ? "is-specular" : "", className].filter(Boolean).join(" ")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0.4 }}
      {...(mergedStyle ? { style: mergedStyle } : {})}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      {specular && <span className="card-light" aria-hidden="true" />}
      {title && <div className="card-title">{title}</div>}
      {children}
    </motion.div>
  );
}
