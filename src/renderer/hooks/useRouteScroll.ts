import { useLayoutEffect, useRef } from "react";
const positions = new Map<string, number>();

export function useRouteScroll(path: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const target = positions.get(path) ?? 0;
    let restoring = true;
    const restore = () => { if (restoring) { element.scrollTop = target; if (Math.abs(element.scrollTop - target) < 1) restoring = false; } };
    const record = () => { if (!restoring) positions.set(path, element.scrollTop); };
    const stopRestoring = () => { restoring = false; };
    const observer = new ResizeObserver(restore);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    const frame = requestAnimationFrame(restore);
    element.addEventListener("scroll", record);
    element.addEventListener("wheel", stopRestoring, { passive: true });
    element.addEventListener("pointerdown", stopRestoring);
    element.addEventListener("keydown", stopRestoring);
    return () => {
      if (!restoring) positions.set(path, element.scrollTop);
      observer.disconnect(); cancelAnimationFrame(frame);
      element.removeEventListener("scroll", record);
      element.removeEventListener("wheel", stopRestoring);
      element.removeEventListener("pointerdown", stopRestoring);
      element.removeEventListener("keydown", stopRestoring);
    };
  }, [path]);
  return ref;
}
