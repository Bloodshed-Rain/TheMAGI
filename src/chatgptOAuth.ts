import crypto from "crypto";
import http from "http";
import type { ChatGPTStatus, ChatGPTModel } from "./chatgptTypes";

export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_RESOURCE = "https://api.openai.com/v1";
const TOKEN_ENDPOINT = `${CHATGPT_ISSUER}/api/accounts/oauth/token`;
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
export interface ChatGPTProfile {
  id: string;
  clientId: string;
  subject: string | null;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number;
  scopes: string[];
}
export interface ChatGPTStore {
  hostId: string;
  activeProfileId: string | null;
  profiles: ChatGPTProfile[];
}
export interface VerifiedChatGPTIdentity {
  subject: string;
  email: string | null;
}
export interface ChatGPTDependencies {
  read(): ChatGPTStore | null;
  write(store: ChatGPTStore): void;
  openBrowser(url: string): Promise<void>;
  verifyIdentity(token: string, clientId: string, nonce?: string): Promise<VerifiedChatGPTIdentity>;
  fetch?: typeof fetch;
}
type TokenGrant = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

function errorMessage(data: any, fallback: string): string {
  // Only display the provider's human-facing error fields, never whole token
  // responses, callback URLs, headers, or request bodies.
  const detail = data?.error?.message || data?.error_description || data?.detail;
  return typeof detail === "string" ? `${fallback}: ${detail.slice(0, 500)}` : fallback;
}
async function checkedJson(response: Response, description: string): Promise<any> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(data, `${description} (${response.status})`));
  return data;
}
function validateGrant(data: any): TokenGrant {
  if (
    typeof data?.access_token !== "string" ||
    !data.access_token ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0 ||
    (data.token_type && (typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer"))
  ) {
    throw new Error("ChatGPT returned an invalid token response. Please reconnect.");
  }
  return data as TokenGrant;
}
export function validateChatGPTCallback(
  url: URL,
  expectedState: string,
  existingClientId: string | null,
): { code: string; clientId: string } {
  const state = url.searchParams.get("state") || "";
  const actual = Buffer.from(state);
  const expected = Buffer.from(expectedState);
  if (
    url.searchParams.getAll("state").length !== 1 ||
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  )
    throw new Error("Invalid sign-in state");
  if (url.searchParams.has("error")) throw new Error("ChatGPT sign-in was declined or cancelled.");
  const issued = url.searchParams.get("client_id") || existingClientId;
  if (
    !issued ||
    issued === "dynamic_agent_client" ||
    (existingClientId && issued !== existingClientId) ||
    url.searchParams.getAll("client_id").length > 1
  )
    throw new Error("Invalid ChatGPT client registration");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.getAll("code").length !== 1) throw new Error("Missing authorization code");
  return { code, clientId: issued };
}

/** Responses output is usable only after a completed terminal event. A partial
 * sentence followed by failure or a dropped connection is not a coaching card. */
export async function readChatGPTResponse(response: Response, onChunk: (chunk: string) => void): Promise<string> {
  if (!response.ok) {
    await checkedJson(response, "ChatGPT analysis failed");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ChatGPT returned no response stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = false;
  const event = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const item = JSON.parse(data);
    if (item.type === "response.output_text.delta" && typeof item.delta === "string") {
      text += item.delta;
      onChunk(item.delta);
    }
    if (["error", "response.failed", "response.incomplete"].includes(item.type))
      throw new Error(errorMessage(item.response || item, "ChatGPT did not complete the analysis"));
    if (item.type === "response.completed") {
      if (item.response?.status !== "completed") throw new Error("ChatGPT analysis did not finish successfully");
      completed = true;
      if (!text) {
        text = (item.response?.output || [])
          .flatMap((output: any) => output.content || [])
          .filter((content: any) => content.type === "output_text")
          .map((content: any) => content.text || "")
          .join("");
        if (text) onChunk(text);
      }
    }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) event(buffer);
    if (!completed) throw new Error("ChatGPT disconnected before completing the analysis. Try again.");
    if (!text.trim()) throw new Error("ChatGPT completed without analysis text. Try another model.");
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class ChatGPTClient {
  private pending: AbortController | null = null;
  private inFlight = new Set<AbortController>();
  private refreshing = new Map<string, Promise<string>>();
  private request: typeof fetch;
  constructor(private deps: ChatGPTDependencies) {
    this.request = deps.fetch || fetch;
  }
  private store(): ChatGPTStore {
    const existing = this.deps.read();
    if (existing) return existing;
    const initial: ChatGPTStore = { hostId: `urn:uuid:${crypto.randomUUID()}`, activeProfileId: null, profiles: [] };
    this.deps.write(initial);
    return initial;
  }
  status(): ChatGPTStatus {
    const store = this.store();
    const profiles = store.profiles.map((profile, index) => ({
      id: profile.id,
      label: `${profile.email || "ChatGPT account"} · Connection ${index + 1}`,
      connected: Boolean(profile.accessToken && (profile.expiresAt > Date.now() || profile.refreshToken)),
      sharing: Boolean(profile.accessToken && profile.scopes.includes(PLAN_SCOPE)),
    }));
    const selected = profiles.find((profile) => profile.id === store.activeProfileId);
    return {
      activeProfileId: store.activeProfileId,
      profiles,
      connected: selected?.connected || false,
      sharing: Boolean(selected?.connected && selected.sharing),
      busy: this.pending !== null,
    };
  }
  cancelSignIn(): void {
    this.pending?.abort(new Error("ChatGPT sign-in cancelled"));
  }
  selectProfile(id: string): ChatGPTStatus {
    if (this.pending) throw new Error("Finish or cancel sign-in before switching accounts.");
    const store = this.store();
    if (!store.profiles.some((profile) => profile.id === id)) throw new Error("Unknown ChatGPT account");
    for (const request of this.inFlight) request.abort();
    store.activeProfileId = id;
    this.deps.write(store);
    return this.status();
  }
  async signIn(
    options: { profileId?: string; newProfile?: boolean; requestConsent?: boolean } = {},
  ): Promise<ChatGPTStatus> {
    if (this.pending) throw new Error("ChatGPT sign-in is already in progress");
    const store = this.store();
    const selectedId =
      options.profileId || store.activeProfileId || (store.profiles.length === 1 ? store.profiles[0]!.id : null);
    const previous = options.newProfile ? undefined : store.profiles.find((profile) => profile.id === selectedId);
    if (options.profileId && !previous) throw new Error("Unknown ChatGPT account");
    const controller = new AbortController();
    this.pending = controller;
    const timeout = setTimeout(() => controller.abort(new Error("ChatGPT sign-in timed out. Try again.")), 5 * 60_000);
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    let accept!: (value: { code: string; clientId: string }) => void;
    let reject!: (error: Error) => void;
    const callback = new Promise<{ code: string; clientId: string }>((resolve, fail) => {
      accept = resolve;
      reject = fail;
    });
    // Attach rejection handling immediately while browser opening is awaited.
    void callback.catch(() => {});
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method !== "GET" || url.pathname !== "/auth/callback") {
        response.writeHead(404).end();
        return;
      }
      try {
        const result = validateChatGPTCallback(url, state, previous?.clientId || null);
        response
          .writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'",
          })
          .end("<h1>Return to MAGI</h1><p>Complete connection setup in MAGI. You can close this tab.</p>");
        accept(result);
      } catch (error) {
        response
          .writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" })
          .end("Sign-in could not be completed. Return to MAGI.");
        // An unsolicited invalid-state request must not cancel the real login.
        if ((error as Error).message !== "Invalid sign-in state") reject(error as Error);
      }
    });
    const abort = () =>
      reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error("Sign-in cancelled"));
    controller.signal.addEventListener("abort", abort, { once: true });
    try {
      await new Promise<void>((resolve, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Could not start the local ChatGPT callback");
      const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
      const authorization = new URL(`${CHATGPT_ISSUER}/api/accounts/authorize`);
      authorization.search = new URLSearchParams({
        client_id: previous?.clientId || "dynamic_agent_client",
        ext_agent_host_id: store.hostId,
        response_type: "code",
        redirect_uri: redirect,
        scope: SCOPES,
        resource: CHATGPT_RESOURCE,
        state,
        nonce,
        code_challenge_method: "S256",
        code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
      }).toString();
      if (!previous) authorization.searchParams.set("agent_name_hint", "MAGI");
      if (previous?.idToken) authorization.searchParams.set("id_token_hint", previous.idToken);
      if (previous?.email) authorization.searchParams.set("login_hint", previous.email);
      if (options.requestConsent) authorization.searchParams.set("prompt", "consent");
      await this.deps.openBrowser(authorization.toString());
      const result = await callback;
      const profile: ChatGPTProfile = previous || {
        id: crypto.randomUUID(),
        clientId: result.clientId,
        subject: null,
        email: null,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        expiresAt: 0,
        scopes: [],
      };
      // Preserve the issued registration even if this authorization code expires.
      const current = this.store();
      if (!current.profiles.some((entry) => entry.id === profile.id)) {
        current.profiles.push(profile);
        this.deps.write(current);
      }
      const grant = await this.tokenRequest(
        {
          grant_type: "authorization_code",
          client_id: result.clientId,
          code: result.code,
          code_verifier: verifier,
          redirect_uri: redirect,
          resource: CHATGPT_RESOURCE,
        },
        controller.signal,
      );
      if (!grant.id_token) throw new Error("ChatGPT did not return a verifiable identity");
      const identity = await this.deps.verifyIdentity(grant.id_token, result.clientId, nonce);
      if (previous?.subject && identity.subject !== previous.subject)
        throw new Error("ChatGPT returned a different account. Add it as a new connection instead.");
      controller.signal.throwIfAborted();
      this.saveGrant(profile.id, grant, identity);
      const next = this.store();
      next.activeProfileId = profile.id;
      this.deps.write(next);
      return { ...this.status(), busy: false };
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", abort);
      server.close();
      server.closeAllConnections();
      this.pending = null;
    }
  }
  private async tokenRequest(fields: Record<string, string>, signal?: AbortSignal): Promise<TokenGrant> {
    const timeout = AbortSignal.timeout(30000);
    const response = await this.request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return validateGrant(await checkedJson(response, "ChatGPT authorization failed"));
  }
  private saveGrant(id: string, grant: TokenGrant, identity?: VerifiedChatGPTIdentity): void {
    const store = this.store();
    const profile = store.profiles.find((entry) => entry.id === id);
    if (!profile) throw new Error("ChatGPT connection no longer exists");
    profile.accessToken = grant.access_token;
    profile.refreshToken = grant.refresh_token || profile.refreshToken;
    profile.idToken = grant.id_token || profile.idToken;
    profile.expiresAt = Date.now() + grant.expires_in * 1000;
    if (typeof grant.scope === "string") profile.scopes = grant.scope.split(/\s+/).filter(Boolean);
    else if (identity) profile.scopes = []; // Never infer consent from requested scopes.
    if (identity) {
      profile.subject = identity.subject;
      profile.email = identity.email;
    }
    this.deps.write(store);
  }
  private async accessToken(): Promise<string> {
    const store = this.store();
    const profile = store.profiles.find((entry) => entry.id === store.activeProfileId);
    if (!profile?.accessToken || !profile.scopes.includes(PLAN_SCOPE))
      throw new Error("Connect ChatGPT and enable ChatGPT plan usage for MAGI first.");
    if (profile.expiresAt > Date.now() + 60000) return profile.accessToken;
    if (!profile.refreshToken) throw new Error("ChatGPT connection expired. Reconnect your account.");
    let refresh = this.refreshing.get(profile.id);
    if (!refresh) {
      refresh = (async () => {
        const grant = await this.tokenRequest({
          grant_type: "refresh_token",
          client_id: profile.clientId,
          refresh_token: profile.refreshToken!,
          resource: CHATGPT_RESOURCE,
        });
        const latest = this.store().profiles.find((entry) => entry.id === profile.id);
        if (latest?.refreshToken !== profile.refreshToken)
          throw new Error("ChatGPT account changed while reconnecting");
        if (grant.id_token) {
          const identity = await this.deps.verifyIdentity(grant.id_token, profile.clientId);
          if (identity.subject !== profile.subject) throw new Error("ChatGPT refresh identity did not match");
        }
        this.saveGrant(profile.id, grant);
        if (
          !this.store()
            .profiles.find((entry) => entry.id === profile.id)
            ?.scopes.includes(PLAN_SCOPE)
        )
          throw new Error("ChatGPT plan usage is no longer authorized. Reconnect your account.");
        return grant.access_token;
      })().finally(() => this.refreshing.delete(profile.id));
      this.refreshing.set(profile.id, refresh);
    }
    const token = await refresh;
    if (this.store().activeProfileId !== profile.id)
      throw new Error("The selected ChatGPT account changed. Try again.");
    return token;
  }
  private async activeAccessToken(): Promise<string> {
    const id = this.store().activeProfileId;
    const token = await this.accessToken();
    const store = this.store();
    const current = store.profiles.find((entry) => entry.id === id);
    if (store.activeProfileId !== id || current?.accessToken !== token || !current.scopes.includes(PLAN_SCOPE))
      throw new Error("ChatGPT connection changed. Reconnect or try again.");
    return token;
  }
  async listModels(): Promise<ChatGPTModel[]> {
    const token = await this.activeAccessToken();
    const controller = new AbortController();
    this.inFlight.add(controller);
    try {
      const response = await this.request(`${CHATGPT_RESOURCE}/models`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      const data = await checkedJson(response, "Could not load ChatGPT models");
      if (!Array.isArray(data?.models)) throw new Error("Unexpected ChatGPT model catalog");
      return data.models
        .filter((model: any) => model.visibility === "list" && typeof model.slug === "string")
        .map((model: any) => ({ id: model.slug, label: model.display_name || model.slug }));
    } finally {
      this.inFlight.delete(controller);
    }
  }
  async analyze(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    onChunk: (chunk: string) => void = () => {},
  ): Promise<string> {
    const token = await this.activeAccessToken();
    const controller = new AbortController();
    this.inFlight.add(controller);
    try {
      const response = await this.request(`${CHATGPT_RESOURCE}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: systemPrompt,
          input: [{ role: "user", content: userPrompt }],
          store: false,
          stream: true,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
      });
      return await readChatGPTResponse(response, onChunk);
    } finally {
      this.inFlight.delete(controller);
    }
  }
  async signOut(): Promise<{ status: ChatGPTStatus; remoteRevoked: boolean }> {
    this.cancelSignIn();
    for (const request of this.inFlight) request.abort();
    const store = this.store();
    const profile = store.profiles.find((entry) => entry.id === store.activeProfileId);
    if (!profile) return { status: this.status(), remoteRevoked: true };
    const refreshToken = profile.refreshToken;
    profile.accessToken = null;
    profile.refreshToken = null;
    profile.idToken = null;
    profile.scopes = [];
    profile.expiresAt = 0;
    this.deps.write(store);
    let remoteRevoked = !refreshToken;
    try {
      if (refreshToken) {
        const metadata = await checkedJson(
          await this.request(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, {
            signal: AbortSignal.timeout(10000),
          }),
          "Could not discover ChatGPT sign-out",
        );
        const endpoint = new URL(metadata.revocation_endpoint);
        if (endpoint.origin !== CHATGPT_ISSUER) throw new Error("Unexpected ChatGPT revocation endpoint");
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await this.request(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                token: refreshToken,
                token_type_hint: "refresh_token",
                client_id: profile.clientId,
              }),
              signal: AbortSignal.timeout(10000),
            });
            remoteRevoked = response.status === 200;
            if (response.status < 500) break;
          } catch {
            remoteRevoked = false;
          }
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } catch {
      remoteRevoked = false;
    }
    return { status: this.status(), remoteRevoked };
  }
}
