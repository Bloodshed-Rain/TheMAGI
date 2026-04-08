---
agent: tux
type: security-audit
scope: full-codebase
date: 2026-04-08
version: 1.4.1
status: initial
findings_critical: 2
findings_high: 5
findings_medium: 7
findings_low: 4
findings_info: 3
---

# MAGI Security Audit -- 2026-04-08

**Auditor:** Tux (security specialist)
**Codebase version:** 1.4.1 (commit 9e2b58d)
**Scope:** Full codebase -- proxy layer, Electron security, secrets management, supply chain, runtime defenses

---

## Domain 1: Proxy Layer

**File reviewed:** `proxy/worker.ts`, `proxy/wrangler.toml`

### F-01 [HIGH] X-MAGI-Version header is trivially spoofable

**What:** The proxy's only authentication is checking for the presence of an `X-MAGI-Version` header (line 79-85). Any value passes, including `X-MAGI-Version: lol`. There is no request signing, no shared secret, no token verification.

**Impact:** Anyone who discovers the proxy URL (hardcoded in `src/llm.ts:121` as `https://magi-llm-proxy.magi-proxy.workers.dev`) can use the OpenAI API key for arbitrary gpt-4o-mini completions by simply setting the header. The URL is public in the GitHub repo.

**Effort:** Trivial -- a single curl command.

**Fix:** Implement HMAC request signing. The app signs each request body with a shared secret (shipped as an env var in the Worker, embedded/obfuscated in the app). This raises the bar from "anyone with curl" to "someone who reverse-engineers the binary." For stronger protection, consider per-user token issuance or a lightweight auth flow.

---

### F-02 [MEDIUM] In-memory rate limiter resets on Worker restart/cold start

**What:** Rate limiting uses an in-memory `Map` (line 27). Cloudflare Workers isolates are ephemeral -- they can be recycled at any time, and different colos have separate isolates. A determined abuser can reset their rate limit by waiting for isolate recycling or hitting different Cloudflare edge nodes.

**Impact:** Rate limiting is best-effort, not durable. An attacker can exceed 60 req/hour by distributing requests across edge locations or waiting for cold starts.

**Effort:** Moderate

**Fix:** Use Cloudflare Rate Limiting rules (free tier includes basic rate limiting) or Durable Objects for persistent counters. Alternatively, use KV with atomic counters.

---

### F-03 [MEDIUM] CORS allows any origin

**What:** `Access-Control-Allow-Origin: *` (line 53) allows any website to make requests to the proxy from a browser context.

**Impact:** A malicious website visited by a MAGI user could make requests to the proxy from the user's browser, consuming rate limit quota. Since the proxy only checks a custom header (which can be set in browser fetch requests), this is exploitable.

**Effort:** Moderate

**Fix:** Restrict CORS origin to `null` (Electron renderer origin) or remove CORS headers entirely since the desktop app makes requests from the main process (Node.js), not the renderer. The proxy does not need browser CORS at all.

---

### F-04 [LOW] No request body size limit

**What:** The worker reads the full request body via `request.json()` without checking Content-Length. An attacker could send extremely large payloads.

**Impact:** Potential Worker CPU/memory abuse, though Cloudflare has built-in limits (128MB body, 30s CPU time). Low practical risk.

**Effort:** Moderate

**Fix:** Check `Content-Length` header and reject requests over a reasonable limit (e.g., 256KB -- coaching prompts are large but bounded).

---

### F-05 [INFO] Proxy URL is hardcoded and public

**What:** `src/llm.ts:121` contains the full proxy URL. Since the repo is public on GitHub, anyone can find it.

**Impact:** Combined with F-01, this makes the proxy trivially discoverable and abusable.

**Effort:** Trivial discovery.

**Fix:** This is inherent to the architecture. Mitigate via F-01 (request signing) and stronger rate limiting.

---

## Domain 2: Electron Security

**Files reviewed:** `src/main/index.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, all handler files in `src/main/handlers/`

### F-06 [MEDIUM] sandbox: false on BrowserWindow

**What:** `src/main/index.ts:60` sets `sandbox: false` with the comment "needed for preload to use require()." This gives the preload script full Node.js access.

**Impact:** If an attacker achieves XSS in the renderer (e.g., via LLM output rendered as HTML), the preload script becomes a bridge to the main process. With `contextIsolation: true`, the preload's `require()` capability is not directly accessible from renderer JS, but `sandbox: false` weakens the defense-in-depth posture significantly.

**Effort:** Advanced -- requires chaining with XSS.

**Fix:** Refactor the preload to not use `require()`. Modern Electron (v20+) supports preload scripts with ESM or bundled code that works in sandboxed mode. The preload only uses `contextBridge` and `ipcRenderer` from Electron, which work in sandboxed mode. Set `sandbox: true`.

---

### F-07 [LOW] DevTools open automatically in dev mode

**What:** `src/main/index.ts:96` calls `mainWindow.webContents.openDevTools()` when `VITE_DEV_SERVER_URL` is set. In production, DevTools are not opened but not explicitly disabled.

**Impact:** A user could open DevTools in production via keyboard shortcut (Ctrl+Shift+I) and inspect/modify the renderer, access the `window.clippi` bridge, or view config data including API keys in memory. This is a local-only risk.

**Effort:** Trivial for local user.

**Fix:** In production builds, disable DevTools: `mainWindow.webContents.on('devtools-opened', () => { mainWindow.webContents.closeDevTools(); })` or remove the menu item. Note: this is defense-in-depth -- a determined local attacker can always patch the binary.

---

### F-08 [MEDIUM] No input validation on config:save

**What:** `src/main/handlers/config.ts:6` passes the renderer-supplied object directly to `saveConfig()` with no schema validation. The renderer can write arbitrary keys to the config JSON file.

**Impact:** A compromised renderer could write unexpected keys to `~/.magi-melee/config.json`, potentially injecting paths or values that other parts of the code trust. For example, overwriting `dolphinPath` to point to a malicious executable.

**Effort:** Moderate -- requires renderer compromise first.

**Fix:** Validate the incoming config against a strict schema. Only allow known keys from the `Config` interface. Strip unexpected properties before merging.

---

### F-09 [LOW] IPC handlers use `any` types for arguments

**What:** `src/main/ipc.ts:3` defines `SafeHandleFn` with `...args: any[]`. Individual handlers cast args without runtime validation (e.g., `_e, scope: string, id: any` in analyze:scoped).

**Impact:** Malformed IPC arguments could cause unexpected behavior. The `analyze:scoped` handler passes `id` through `Number()` and `String()` coercions, which is safe but fragile. A type confusion bug could lead to unexpected query results.

**Effort:** Moderate

**Fix:** Add runtime validation (e.g., zod schemas or manual type guards) at the IPC boundary for all handlers. The `validatePath` function is a good pattern -- extend it to other argument types.

---

### F-10 [INFO] CSP is present but could be tighter

**What:** `src/renderer/index.html:6` has a CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`. This is a solid baseline. `connect-src` defaults to `'self'` which blocks renderer-initiated network requests (LLM calls go through main process IPC -- correct pattern).

**Impact:** Low. The `'unsafe-inline'` for styles is common for CSS-in-JS/frameworks but technically allows injected style elements.

**Effort:** N/A

**Fix:** Consider removing `'unsafe-inline'` for styles by using nonce-based CSP if the framework supports it. This is minor and aspirational.

---

### F-11 [MEDIUM] Navigation blocking has dev-mode exception that could be abused

**What:** `src/main/index.ts:72-84` blocks navigation but allows URLs matching the Vite dev server origin. The check allows any URL with `/@vite` in the path from the dev origin. In dev mode, if a malicious page is loaded on the same localhost port, navigation would be permitted.

**Impact:** Dev-mode only risk. In production, all navigation is correctly blocked. `setWindowOpenHandler` correctly denies new windows.

**Effort:** Advanced (dev-mode only, requires local network access).

**Fix:** Acceptable for dev mode. No action needed for production.

---

## Domain 3: Secrets Management

**Files reviewed:** `src/main/index.ts` (loadEnvFile), `src/config.ts`, `src/mcp-server.ts`, `src/main/handlers/analysis.ts`, `src/main/handlers/llm.ts`, `package.json`

### F-12 [CRITICAL] key.env ships inside packaged builds via extraResources

**What:** `package.json` build config (line 52-55) includes `{ "from": "key.env", "to": "." }` in `extraResources`. The `key.env` file at the project root (confirmed to exist, 328 bytes) is bundled into every release artifact (Windows .exe, Linux AppImage, macOS .dmg). `loadEnvFile()` in `src/main/index.ts:7-8` reads it from `process.resourcesPath` in production.

**Impact:** Any API keys in `key.env` (OpenAI, OpenRouter, Gemini, Anthropic) are shipped to every user in plaintext, extractable from the app resources. Given the recent proxy deployment, the OpenAI key should no longer be needed locally, but any key present in key.env at build time will be shipped.

**Effort:** Trivial -- extract the AppImage/exe resources, read key.env.

**Fix:** Remove `key.env` from `extraResources` in package.json. The OpenAI key is now server-side via the proxy. For dev/CLI usage, keep key.env locally but never ship it. If other keys are needed at build time for a default experience, they should go through a proxy like OpenAI does.

---

### F-13 [CRITICAL] config:load exposes API keys to the renderer process

**What:** `config:load` IPC handler returns the full `Config` object including `openrouterApiKey`, `geminiApiKey`, and `anthropicApiKey` in plaintext. The Settings page reads these to display in input fields (`src/renderer/pages/Settings.tsx:486-504`). The `useConfig()` hook (`src/renderer/hooks/queries.ts:8`) caches this in React Query, making keys available to any component.

**Impact:** If an XSS vulnerability exists in the renderer (e.g., through LLM-generated content rendered via react-markdown), the attacker can read `window.clippi.loadConfig()` to exfiltrate all configured API keys. The CSP blocks `connect-src` from the renderer, but data could be exfiltrated through the IPC bridge (e.g., by calling `analyzeReplays` with a crafted prompt that includes the keys).

**Effort:** Moderate -- requires XSS in the renderer first, but the LLM output rendering surface (react-markdown) is a plausible vector.

**Fix:** Never send raw API keys to the renderer. Instead:
1. Create a separate `config:load-safe` IPC that returns config with keys redacted (like the MCP server does).
2. For the Settings UI, use a separate `config:has-key` IPC that returns booleans indicating which keys are set.
3. For key input, use a write-only pattern: the renderer sends new key values to main process, but never reads them back.

---

### F-14 [HIGH] MCP server magi_db_query allows arbitrary SELECT queries

**What:** `src/mcp-server.ts:237-248` accepts arbitrary SQL from MCP clients. It checks that the query starts with `SELECT` and doesn't contain multi-statement writes, but this regex-based validation is bypassable. For example: `SELECT * FROM games; --` with a comment would pass the multi-statement check. More importantly, any SELECT query can read `coaching_analyses` which contains full LLM outputs, and the `games` table which contains file paths.

**Impact:** An MCP client (Claude Desktop, any MCP consumer) can read all data in the database including coaching analyses, replay file paths, and game statistics. This is arguably by design for MCP, but the lack of row-level filtering means any connected MCP client sees everything.

**Effort:** Trivial for any MCP client.

**Fix:** This is partially by design (MCP is meant to expose data). However, consider:
1. Remove `magi_db_query` and only expose purpose-built tools (the other 11 tools cover most use cases).
2. If keeping raw SQL, add table-level allowlisting (only `games`, `game_stats`, `highlights` -- not `coaching_analyses`).
3. Document that MCP access = full read access to the database.

---

### F-15 [HIGH] MCP server magi_get_config redacts keys but magi_db_query could leak env-derived data

**What:** `magi_get_config` correctly redacts API keys (line 226-234). However, `magi_db_query` with `SELECT * FROM coaching_analyses` could leak information about which models/providers were used, and LLM prompts could inadvertently contain key fragments in error messages.

**Impact:** Information disclosure through alternate data access paths.

**Effort:** Trivial via MCP.

**Fix:** See F-14 remediation.

---

## Domain 4: Supply Chain

**Files reviewed:** `package.json`, `npm audit` output

### F-16 [HIGH] 8 known vulnerabilities including 4 high-severity

**What:** `npm audit` reports:
- **lodash** (high): Code injection via `_.template`, prototype pollution via `_.unset`/`_.omit`
- **picomatch 4.0.0-4.0.3** (high): Method injection in POSIX char classes, ReDoS via extglob
- **vite 8.0.0-8.0.4** (high): Path traversal in optimized deps, `server.fs.deny` bypass, arbitrary file read via WebSocket (dev server only)
- **@xmldom/xmldom** (high): XML injection via unsafe CDATA serialization
- **electron 41.0.0-41.0.4** (moderate): HTTP response header injection, use-after-free, clipboard crash, named window.open scoping
- **brace-expansion** (moderate): Zero-step sequence causes process hang
- **hono** (moderate): Middleware bypass, cookie issues, path traversal (transitive dep, not directly used)

**Impact:** The vite vulnerabilities are dev-mode only. The electron vulnerabilities could allow response header injection in custom protocol handlers. Lodash prototype pollution could affect data processing.

**Effort:** Trivial -- `npm audit fix` resolves all.

**Fix:** Run `npm audit fix`. For electron specifically, upgrade to the latest patch version. Monitor for future advisories.

---

### F-17 [HIGH] Lodash with known prototype pollution in dependency tree

**What:** Lodash <= 4.17.23 is in the dependency tree with prototype pollution vulnerabilities. Lodash is likely a transitive dependency of one of the direct deps.

**Impact:** If attacker-controlled data flows through `_.unset` or `_.omit`, it could pollute Object.prototype. In the MAGI context, .slp replay data parsed by slippi-js flows through many processing functions. A crafted .slp file could potentially trigger this if lodash is used in the parse chain.

**Effort:** Advanced -- requires understanding the exact data flow through lodash.

**Fix:** Run `npm audit fix`. If lodash is a transitive dep that can't be updated, use `overrides` in package.json to force a patched version.

---

## Domain 5: Runtime Defenses

**Files reviewed:** All `src/` files via pattern search

### F-18 [MEDIUM] LLM output rendered via react-markdown without sanitization boundary

**What:** `src/renderer/components/CoachingCards.tsx` and `src/renderer/pages/Trends.tsx` render LLM responses through `react-markdown`. While react-markdown does not render raw HTML by default (it escapes HTML tags), the custom `Components` override in `src/renderer/utils/timestampLinks.tsx` creates clickable elements from parsed content. If LLM output contains crafted markdown, it could trigger unexpected rendering behavior.

**Impact:** react-markdown is generally safe (no `dangerouslySetInnerHTML` found anywhere in the codebase, no `innerHTML` usage). The risk is low but the attack surface is the LLM response itself -- a compromised LLM provider or prompt injection could generate markdown designed to exploit any rendering edge case.

**Effort:** Advanced -- requires LLM output manipulation.

**Fix:** This is well-defended by default. For additional hardening:
1. Add `rehype-sanitize` plugin to react-markdown to explicitly strip any HTML that might slip through.
2. Consider content length limits on LLM responses before rendering.

---

### F-19 [MEDIUM] Dolphin launch uses spawn with validated path but dolphinPath comes from config

**What:** `src/main/handlers/dolphin.ts:132` spawns `dolphinPath` as a child process. The `replayPath` is validated via `validatePath()`, but `dolphinPath` comes directly from `loadConfig().dolphinPath` (user config) or auto-detection. If `config:save` is exploited (F-08) to set `dolphinPath` to a malicious binary, `spawn` will execute it.

**Impact:** Arbitrary code execution if combined with config injection. However, this requires the attacker to first compromise the renderer (for IPC access) and then convince the user to click "Open in Dolphin."

**Effort:** Advanced -- requires chaining multiple vulnerabilities.

**Fix:** Validate `dolphinPath` before spawning: check it's an absolute path, exists, and optionally check it's in an expected location or has an expected filename pattern. Add a confirmation dialog if the path was recently changed.

---

### F-20 [INFO] Database uses parameterized queries throughout -- GOOD

**What:** All database queries in `src/db.ts` use parameterized queries via `better-sqlite3`'s `.prepare()` with `?` placeholders. The one exception is `getStatTrend()` which interpolates `statColumn` into SQL, but this is protected by an explicit allowlist (line 1086-1097). No string concatenation of user input into SQL was found.

**Impact:** No SQL injection risk in the application code.

**Effort:** N/A

**Fix:** None needed. The `getStatTrend` allowlist pattern is a good model for any future dynamic column queries.

---

### F-21 [LOW] No integrity verification on .slp files before parsing

**What:** `.slp` files are parsed directly by `slippi-js` via `processGame()`. There is no size limit check, magic byte verification, or sandboxing of the parse operation. The `parsePool.ts` has a 60-second timeout (line 17), which is good.

**Impact:** A maliciously crafted .slp file could exploit a vulnerability in slippi-js or its dependencies (e.g., ubjson parsing). The timeout prevents infinite hangs but not memory bombs.

**Effort:** Advanced -- requires finding a vulnerability in slippi-js.

**Fix:** Add a file size check before parsing (legitimate .slp files are typically 50KB-5MB). Verify the first 4 bytes match the SLP magic bytes. Consider a memory limit on worker threads.

---

## Summary

### Findings by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | F-12, F-13 |
| HIGH | 5 | F-01, F-14, F-15, F-16, F-17 |
| MEDIUM | 7 | F-02, F-03, F-06, F-08, F-11, F-18, F-19 |
| LOW | 4 | F-04, F-07, F-09, F-21 |
| INFO | 3 | F-05, F-10, F-20 |
| **Total** | **21** | |

### Overall Risk Posture

**Moderate-High.** The codebase demonstrates good security awareness in several areas -- contextIsolation is enabled, path traversal is defended against, SQL queries are parameterized, navigation is blocked, and the CSP is solid. However, two critical issues (shipping key.env in builds and leaking API keys to the renderer) and the trivially abusable proxy undermine these defenses.

### Top 3 Priority Fixes

1. **F-12: Remove key.env from extraResources** -- Immediate action. Every shipped build contains your API keys in plaintext. This is the highest-impact fix (one line change in package.json).

2. **F-13: Stop sending API keys to the renderer** -- Refactor config:load to never return raw key values to the renderer process. This closes the most dangerous XSS escalation path.

3. **F-01: Add request signing to the proxy** -- The proxy URL is public and the only protection is a trivially spoofable header. Without signing, anyone can consume your OpenAI budget.

### Positive Findings

- contextIsolation: true (correctly set)
- nodeIntegration: false (correctly set)
- All navigation blocked in production
- window.open blocked
- Path traversal validation on IPC file paths
- Parameterized SQL queries throughout
- No eval(), new Function(), innerHTML, or dangerouslySetInnerHTML
- No shell.openExternal (no URL-based attacks)
- MCP config endpoint redacts API keys
- LLM call routing through main process (not renderer)
- Auto-updater uses electron-updater with GitHub releases (signed by default)
