import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { pageForHash } from "./pageRegistry";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Load the landing page's chunk before the first render. Rendering first would show a
// Suspense fallback, which React then keeps up for 300ms even though the chunk is local.
// preload() never rejects, so a failed load still renders and falls back to React.lazy.
const root = document.getElementById("root")!;
void pageForHash(window.location.hash)
  .preload()
  .then(() =>
    createRoot(root).render(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <HashRouter>
              {/* reducedMotion="user" honors the OS prefers-reduced-motion flag for
              ALL framer-motion animations (transforms/scale/x/y/rotate auto-skip;
              opacity is preserved) — the CSS @media block only covered CSS animations. */}
              <MotionConfig reducedMotion="user">
                <App />
              </MotionConfig>
            </HashRouter>
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>,
    ),
  );
