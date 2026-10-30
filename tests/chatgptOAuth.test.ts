import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ChatGPTClient,
  CHATGPT_RESOURCE,
  readChatGPTResponse,
  validateChatGPTCallback,
  type ChatGPTStore,
} from "../src/chatgptOAuth";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const events = (items: unknown[]) =>
  new Response(items.map((item) => `data: ${JSON.stringify(item)}\r\n\r\n`).join(""));
const completed = () =>
  events([
    { type: "response.output_text.delta", delta: "Hold center." },
    { type: "response.completed", response: { status: "completed" } },
  ]);
function harness() {
  let store: ChatGPTStore | null = null;
  const authorizations: URL[] = [];
  let registration = 0;
  const request = vi.fn(async (url: string | URL | Request, _options?: RequestInit) => {
    if (String(url).endsWith("/oauth/token"))
      return json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        id_token: "test-id",
        expires_in: 3600,
        scope: "openid chatgpt.tokens.use.direct",
        token_type: "Bearer",
      });
    if (String(url).endsWith("/models"))
      return json({
        models: [
          { slug: "account-model", display_name: "Available model", visibility: "list" },
          { slug: "hidden", visibility: "hide" },
        ],
      });
    if (String(url).endsWith("/responses")) return completed();
    if (String(url).includes("openid-configuration"))
      return json({ revocation_endpoint: "https://auth.openai.com/revoke" });
    if (String(url).endsWith("/revoke")) return new Response(null, { status: 200 });
    throw new Error("Unexpected test request");
  });
  const verifyIdentity = vi.fn(async () => ({ subject: "user-1", email: "player@example.invalid" }));
  const openBrowser = vi.fn(async (raw: string) => {
    const url = new URL(raw);
    authorizations.push(url);
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", "test-code");
    callback.searchParams.set(
      "client_id",
      url.searchParams.get("client_id") === "dynamic_agent_client"
        ? `issued-${++registration}`
        : url.searchParams.get("client_id")!,
    );
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    await response.text();
  });
  const client = new ChatGPTClient({
    read: () => structuredClone(store),
    write: (next) => {
      store = structuredClone(next);
    },
    openBrowser,
    verifyIdentity,
    fetch: request as typeof fetch,
  });
  return {
    client,
    request,
    verifyIdentity,
    openBrowser,
    authorizations,
    getStore: () => structuredClone(store)!,
    setStore: (next: ChatGPTStore) => {
      store = structuredClone(next);
    },
  };
}

describe("ChatGPT browser authorization", () => {
  it("uses a loopback callback, fresh PKCE and nonce, issued client ID, and stable host ID", async () => {
    const h = harness();
    const result = await h.client.signIn();
    expect(result.sharing).toBe(true);
    expect(result.busy).toBe(false);
    const url = h.authorizations[0]!;
    expect(url.origin).toBe("https://auth.openai.com");
    expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(url.searchParams.get("agent_name_hint")).toBe("MAGI");
    expect(url.searchParams.get("resource")).toBe(CHATGPT_RESOURCE);
    expect(url.searchParams.get("ext_agent_host_id")).toMatch(/^urn:uuid:/);
    expect(new URL(url.searchParams.get("redirect_uri")!).hostname).toBe("127.0.0.1");
    const exchange = h.request.mock.calls.find(([endpoint]) => String(endpoint).endsWith("/oauth/token"))![1]!;
    const fields = exchange.body as URLSearchParams;
    expect(fields.get("client_id")).toBe("issued-1");
    expect(fields.get("redirect_uri")).toBe(url.searchParams.get("redirect_uri"));
    expect(fields.has("client_secret")).toBe(false);
    expect(crypto.createHash("sha256").update(fields.get("code_verifier")!).digest("base64url")).toBe(
      url.searchParams.get("code_challenge"),
    );
    expect(h.verifyIdentity).toHaveBeenCalledWith("test-id", "issued-1", url.searchParams.get("nonce"));
    expect(JSON.stringify(result)).not.toMatch(/test-access|test-refresh|test-id/);
  });
  it("reuses the registration and host for a returning account", async () => {
    const h = harness();
    await h.client.signIn();
    await h.client.signIn();
    const first = h.authorizations[0]!,
      second = h.authorizations[1]!;
    expect(second.searchParams.get("client_id")).toBe("issued-1");
    expect(second.searchParams.has("agent_name_hint")).toBe(false);
    expect(second.searchParams.get("id_token_hint")).toBe("test-id");
    expect(second.searchParams.get("ext_agent_host_id")).toBe(first.searchParams.get("ext_agent_host_id"));
    expect(second.searchParams.get("nonce")).not.toBe(first.searchParams.get("nonce"));
    expect(h.getStore().profiles).toHaveLength(1);
  });
  it("keeps separate registrations distinct even with the same email", async () => {
    const h = harness();
    await h.client.signIn();
    const first = h.client.status().activeProfileId!;
    await h.client.signIn({ newProfile: true });
    expect(h.client.status().profiles).toHaveLength(2);
    expect(h.client.status().profiles[0]!.label).not.toBe(h.client.status().profiles[1]!.label);
    h.client.selectProfile(first);
    expect(h.client.status().activeProfileId).toBe(first);
  });
  it("does not infer plan permission from successful identity sign-in", async () => {
    const h = harness();
    h.request.mockResolvedValueOnce(
      json({ access_token: "test-access", id_token: "test-id", expires_in: 3600, scope: "openid email" }),
    );
    const result = await h.client.signIn();
    expect(result.connected).toBe(true);
    expect(result.sharing).toBe(false);
    await expect(h.client.analyze("coach", "game context", "model")).rejects.toThrow("enable ChatGPT plan usage");
    expect(h.request).toHaveBeenCalledTimes(1);
  });
  it("preserves the selected account if a returning identity does not match", async () => {
    const h = harness();
    await h.client.signIn();
    const original = h.getStore();
    h.verifyIdentity.mockResolvedValueOnce({ subject: "other-user", email: "other@example.invalid" });
    await expect(h.client.signIn()).rejects.toThrow("different account");
    expect(h.getStore()).toEqual(original);
  });
  it("can cancel a pending login without storing credentials", async () => {
    const h = harness();
    h.openBrowser.mockResolvedValue(undefined);
    const pending = h.client.signIn();
    await vi.waitFor(() => expect(h.openBrowser).toHaveBeenCalledOnce());
    h.client.cancelSignIn();
    await expect(pending).rejects.toThrow("cancelled");
    expect(h.getStore().profiles).toHaveLength(0);
    expect(h.client.status().busy).toBe(false);
  });
  it("rejects callback substitution, duplicate state, and declined consent", () => {
    const url = new URL("http://127.0.0.1/auth/callback?code=test&state=expected&client_id=issued");
    expect(validateChatGPTCallback(url, "expected", null)).toEqual({ code: "test", clientId: "issued" });
    expect(() => validateChatGPTCallback(url, "wrong", null)).toThrow("Invalid sign-in state");
    expect(() => validateChatGPTCallback(url, "expected", "other-client")).toThrow("registration");
    url.searchParams.append("state", "expected");
    expect(() => validateChatGPTCallback(url, "expected", null)).toThrow("state");
    const denied = new URL("http://127.0.0.1/auth/callback?state=expected&error=access_denied");
    expect(() => validateChatGPTCallback(denied, "expected", null)).toThrow("declined");
  });
  it("refuses to exchange with the dynamic-registration placeholder", () => {
    expect(() =>
      validateChatGPTCallback(
        new URL("http://127.0.0.1/auth/callback?state=s&code=c&client_id=dynamic_agent_client"),
        "s",
        null,
      ),
    ).toThrow("registration");
  });
});

describe("ChatGPT analysis sessions", () => {
  it("discovers account models and sends only supported Responses fields", async () => {
    const h = harness();
    await h.client.signIn();
    expect(await h.client.listModels()).toEqual([{ id: "account-model", label: "Available model" }]);
    const onChunk = vi.fn();
    expect(await h.client.analyze("Coach from evidence", "Replay summary", "account-model", onChunk)).toBe(
      "Hold center.",
    );
    const request = h.request.mock.calls.find(([url]) => String(url).endsWith("/responses"))![1]!;
    expect(JSON.parse(request.body as string)).toEqual({
      model: "account-model",
      instructions: "Coach from evidence",
      input: [{ role: "user", content: "Replay summary" }],
      store: false,
      stream: true,
    });
    expect(onChunk).toHaveBeenCalledWith("Hold center.");
  });
  it("serializes rotating-token refresh across simultaneous analysis calls", async () => {
    const h = harness();
    await h.client.signIn();
    const store = h.getStore();
    store.profiles[0]!.expiresAt = 0;
    h.setStore(store);
    h.request.mockClear();
    await Promise.all([h.client.analyze("s", "u1", "model"), h.client.analyze("s", "u2", "model")]);
    const requests = h.request.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"));
    expect(requests).toHaveLength(1);
    const body = requests[0]![1]!.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("issued-1");
    expect(body.has("scope")).toBe(false);
  });
  it("clears credentials on logout while retaining registration and host", async () => {
    const h = harness();
    await h.client.signIn();
    const before = h.getStore();
    const result = await h.client.signOut();
    expect(result.remoteRevoked).toBe(true);
    expect(result.status.connected).toBe(false);
    const after = h.getStore();
    expect(after.hostId).toBe(before.hostId);
    expect(after.profiles[0]!.clientId).toBe("issued-1");
    expect(after.profiles[0]!.accessToken).toBeNull();
    expect(after.profiles[0]!.refreshToken).toBeNull();
    expect(after.profiles[0]!.idToken).toBeNull();
  });
  it("reports when remote revocation could not be confirmed", async () => {
    const h = harness();
    await h.client.signIn();
    h.request.mockImplementation(async (url) =>
      String(url).includes("openid-configuration")
        ? json({ revocation_endpoint: "https://auth.openai.com/revoke" })
        : json({}, 503),
    );
    const result = await h.client.signOut();
    expect(result.remoteRevoked).toBe(false);
    expect(result.status.connected).toBe(false);
  });
});

describe("ChatGPT response completion", () => {
  it("rejects a truncated stream despite partial text", async () => {
    await expect(
      readChatGPTResponse(events([{ type: "response.output_text.delta", delta: "Partial advice" }]), () => {}),
    ).rejects.toThrow("before completing");
  });
  it.each(["response.failed", "response.incomplete", "error"])(
    "rejects %s instead of saving a coaching card",
    async (type) => {
      await expect(
        readChatGPTResponse(
          events([
            { type: "response.output_text.delta", delta: "Partial" },
            { type, response: { error: { message: "Request failed" } } },
          ]),
          () => {},
        ),
      ).rejects.toThrow("Request failed");
    },
  );
  it("handles SSE events fragmented across arbitrary chunks", async () => {
    const text =
      'data: {"type":"response.output_text.delta","delta":"Melee ✓"}\r\n\r\ndata: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    await expect(readChatGPTResponse(new Response(body), () => {})).resolves.toBe("Melee ✓");
  });
});
