import { useEffect, useRef, type RefObject } from "react";

const dialogs: symbol[] = [];
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export function useDialog(
  ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>, modal = true,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;
    const token = Symbol();
    dialogs.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const excluded: Array<{ element: HTMLElement; inert: boolean }> = [];
    if (modal) {
      let node: HTMLElement = panel;
      while (node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && sibling instanceof HTMLElement) {
            excluded.push({ element: sibling, inert: sibling.inert });
            sibling.inert = true;
          }
        }
        node = node.parentElement;
        if (node === document.body) break;
      }
    }
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(focusable)).filter(
      (element) => element.getClientRects().length > 0 && element.tabIndex >= 0 && !element.closest('[inert]'),
    );
    const focusFirst = () => (initialFocus?.current ?? controls()[0] ?? panel).focus();
    const frame = requestAnimationFrame(focusFirst);
    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab" && modal) {
        const elements = controls();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) { event.preventDefault(); panel.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (modal && dialogs.at(-1) === token && !panel.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(frame);
      dialogs.splice(dialogs.indexOf(token), 1);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      excluded.forEach(({ element, inert }) => { element.inert = inert; });
      const label = previous?.getAttribute("aria-label");
      const restore = previous?.isConnected ? previous : label ? document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`) : null;
      if (restore && !restore.closest('[inert]')) restore.focus();
    };
  }, [ref, open, initialFocus, modal]);
}
