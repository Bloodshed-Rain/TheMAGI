import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PlayPanel, PlaySide } from "../../playMode";

export interface PlayPanelDrop {
  side: PlaySide;
  /** Insertion slot in that sidebar's list as it is shown now. */
  index: number;
}

/** Pointer travel before a press becomes a drag, so a click never moves a module. */
const DRAG_THRESHOLD = 6;
const CONTROLS = "button, input, textarea, select, a";
const SIDES = ["left", "right"] as const;

/**
 * Drag Play Mode modules between and within the sidebars.
 *
 * This uses pointer capture rather than HTML drag-and-drop on purpose: the
 * hosted game is a native window between the two sidebars, and a captured
 * pointer keeps reporting while it crosses that window. Keyboard users arrange
 * with each module's own buttons instead.
 */
export function usePlayPanelDrag(enabled: boolean, onPlace: (id: PlayPanel, side: PlaySide, index: number) => void) {
  const [dragging, setDragging] = useState<PlayPanel | null>(null);
  const [drop, setDrop] = useState<PlayPanelDrop | null>(null);
  const sidebars = useRef<Record<PlaySide, HTMLElement | null>>({ left: null, right: null });
  const ghost = useRef<HTMLElement | null>(null);
  const gesture = useRef<{
    id: PlayPanel;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  const target = (x: number, y: number): PlayPanelDrop | null => {
    for (const side of SIDES) {
      const sidebar = sidebars.current[side];
      if (!sidebar) continue;
      const bounds = sidebar.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;
      const panels = [...sidebar.querySelectorAll<HTMLElement>(":scope > .play-panel")];
      const index = panels.findIndex((panel) => {
        const rect = panel.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      return { side, index: index === -1 ? panels.length : index };
    }
    return null;
  };
  const moveGhost = () => {
    const current = gesture.current;
    if (ghost.current && current) ghost.current.style.transform = `translate(${current.x + 14}px, ${current.y + 14}px)`;
  };
  const stop = () => {
    gesture.current = null;
    setDragging(null);
    setDrop(null);
  };

  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      gesture.current = null;
      setDragging(null);
      setDrop(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  /** Spread onto the element a module is dragged by. */
  const grab = (id: PlayPanel) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0 || (event.target as Element).closest(CONTROLS)) return;
      gesture.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.active) {
        if (Math.hypot(current.x - current.startX, current.y - current.startY) < DRAG_THRESHOLD) return;
        current.active = true;
        setDragging(current.id);
      }
      moveGhost();
      const next = target(current.x, current.y);
      setDrop((previous) => (previous?.side === next?.side && previous?.index === next?.index ? previous : next));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const next = current.active ? target(event.clientX, event.clientY) : null;
      stop();
      if (next) onPlace(current.id, next.side, next.index);
    },
    onPointerCancel: stop,
    onLostPointerCapture: () => {
      if (gesture.current) stop();
    },
  });

  return {
    /** The module in flight, or null. Always null while arranging is off. */
    dragging: enabled ? dragging : null,
    drop: enabled ? drop : null,
    grab,
    sidebarRef: (side: PlaySide) => (element: HTMLElement | null) => {
      sidebars.current[side] = element;
    },
    ghostRef: (element: HTMLElement | null) => {
      ghost.current = element;
      moveGhost();
    },
  };
}

export type PlayPanelGrab = ReturnType<typeof usePlayPanelDrag>["grab"];
