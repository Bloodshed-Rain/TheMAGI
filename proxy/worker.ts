/**
 * MAGI LLM Proxy — Cloudflare Worker
 *
 * Sits between the MAGI desktop app and the OpenAI API so the real API key
 * never leaves this server.  Provides per-IP rate limiting, HMAC request
 * signing, and model restriction.
 *
 * Deploy:
 *   1. `npm install -g wrangler` (or `npx wrangler`)
 *   2. `wrangler secret put OPENAI_API_KEY`   ← paste your real key
 *   3. `wrangler secret put HMAC_SECRET`      ← paste a random 64-char hex string
 *   4. `wrangler deploy`
 *
 * Generate HMAC_SECRET:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Copy the same value into HMAC_SECRET in src/llm.ts.
 *
 * The worker URL becomes the MAGI_PROXY_URL in src/llm.ts.
 */

interface Env {
  OPENAI_API_KEY: string;
  HMAC_SECRET: string;
}

// ── Rate limiting (in-memory, per-isolate) ──────────────────────────

const RATE_WINDOW_MS = 3_600_000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 60; // per IP per hour

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) return false;
  bucket.count++;
  return true;
}

function pruneStale(): void {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(ip);
  }
}

// ── HMAC verification ───────────────────────────────────────────────

async function verifyHMAC(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // Reject requests older than 5 minutes to prevent replay attacks
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 300_000) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${timestamp}.${body}`);
  const sig = hexToBytes(signature);
  if (!sig) return false;

  return crypto.subtle.verify("HMAC", key, sig, data);
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ── Response helper ─────────────────────────────────────────────────

function jsonResponse(body: string | null, status: number, extra?: Record<string, string>): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json", ...extra } });
}

// ── Worker entry ────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only POST allowed
    if (request.method !== "POST") {
      return jsonResponse(JSON.stringify({ error: "Method not allowed" }), 405);
    }

    // Require MAGI app header
    const magiVersion = request.headers.get("X-MAGI-Version");
    if (!magiVersion) {
      return jsonResponse(JSON.stringify({ error: "Forbidden" }), 403);
    }

    // Read body once for both HMAC verification and forwarding
    const rawBody = await request.text();

    // Verify HMAC signature
    const timestamp = request.headers.get("X-MAGI-Timestamp");
    const signature = request.headers.get("X-MAGI-Signature");
    if (!timestamp || !signature) {
      return jsonResponse(JSON.stringify({ error: "Missing signature" }), 401);
    }
    const valid = await verifyHMAC(rawBody, timestamp, signature, env.HMAC_SECRET);
    if (!valid) {
      return jsonResponse(JSON.stringify({ error: "Invalid signature" }), 401);
    }

    // Rate limit by IP
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!rateLimit(ip)) {
      pruneStale();
      return jsonResponse(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        429,
      );
    }

    // Parse and validate the request body
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return jsonResponse(JSON.stringify({ error: "Invalid JSON" }), 400);
    }

    // Only allow chat completions
    if (!body.model || !Array.isArray(body.messages)) {
      return jsonResponse(
        JSON.stringify({ error: "Invalid request: model and messages required" }),
        400,
      );
    }

    // Restrict to allowed models
    const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o-mini-2024-07-18"];
    const model = String(body.model);
    if (!ALLOWED_MODELS.includes(model)) {
      return jsonResponse(
        JSON.stringify({ error: `Model "${model}" is not available through the MAGI proxy` }),
        403,
      );
    }

    // Cap token output
    if (typeof body.max_completion_tokens === "number" && body.max_completion_tokens > 16384) {
      body.max_completion_tokens = 16384;
    }

    // Forward to OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return new Response(openaiResponse.body, {
      status: openaiResponse.status,
      headers: {
        "Content-Type": openaiResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  },
} satisfies ExportedHandler<Env>;
