import { lazy, useState, type ComponentType } from "react";

/**
 * A code-split page that can be loaded ahead of its first render.
 *
 * `React.lazy` alone suspends on the first render of every page, and React keeps a
 * Suspense fallback on screen for at least 300ms once it has been shown. The chunks
 * are local files that load in a few milliseconds, so that floor was most of the
 * cost of opening a page for the first time. A page that has been preloaded renders
 * directly, with no fallback; one that has not still falls back to `React.lazy`.
 */
export interface LazyPage<P extends object> {
  (props: P): React.JSX.Element;
  /** Start (or join) loading the page's chunk. Never rejects. */
  preload: () => Promise<void>;
}

export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): LazyPage<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;

  const Suspending = lazy(() => load().then((component) => ({ default: component })));

  function Page(props: P): React.JSX.Element {
    // Chosen once per mount: swapping component type mid-life would remount the page.
    const [Component] = useState<ComponentType<P>>(() => loaded ?? (Suspending as unknown as ComponentType<P>));
    return <Component {...props} />;
  }

  Page.preload = (): Promise<void> => {
    pending ??= load().then(
      (component) => {
        loaded = component;
      },
      () => {
        // A failed preload is retried by React.lazy when the page is actually opened.
        pending = null;
      },
    );
    return pending;
  };

  return Page;
}

/**
 * Preload pages in order once the renderer is first idle. They load one after another
 * rather than all at once, so no single task parses every chunk; each load is its own
 * task, which leaves the event loop free for input in between.
 */
export function preloadWhenIdle(pages: readonly { preload: () => Promise<void> }[]): () => void {
  let cancelled = false;
  const handle = window.requestIdleCallback(
    () => {
      void (async () => {
        for (const page of pages) {
          if (cancelled) return;
          await page.preload();
        }
      })();
    },
    { timeout: 1000 },
  );

  return () => {
    cancelled = true;
    window.cancelIdleCallback(handle);
  };
}
