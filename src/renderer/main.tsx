import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./hooks/cache";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/index.css";


const root = document.getElementById("root")!;
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
);
