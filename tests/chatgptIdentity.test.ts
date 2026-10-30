import { beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { verifyChatGPTIdentity } from "../src/chatgptIdentity";

describe("ChatGPT signed identity validation", () => {
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwk: JWK;
  beforeAll(async () => {
    keys = await generateKeyPair("RS256");
    jwk = await exportJWK(keys.publicKey);
    jwk.kid = "test-key";
  });
  const fetcher = () =>
    vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(url).includes("openid-configuration")
              ? { issuer: "https://auth.openai.com", jwks_uri: "https://auth.openai.com/test-jwks" }
              : { keys: [jwk] },
          ),
        ),
    );
  const token = (overrides: Record<string, unknown> = {}) =>
    new SignJWT({ nonce: "expected-nonce", email: "test@example.invalid", ...overrides })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://auth.openai.com")
      .setAudience("issued-client")
      .setSubject("account-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
  it("accepts a signed identity bound to this client and attempt", async () => {
    await expect(
      verifyChatGPTIdentity(await token(), "issued-client", "expected-nonce", fetcher() as typeof fetch),
    ).resolves.toEqual({ subject: "account-1", email: "test@example.invalid" });
  });
  it("rejects a token from another authorization attempt", async () => {
    await expect(
      verifyChatGPTIdentity(
        await token({ nonce: "other" }),
        "issued-client",
        "expected-nonce",
        fetcher() as typeof fetch,
      ),
    ).rejects.toThrow("verification failed");
  });
  it("rejects another client’s token", async () => {
    await expect(
      verifyChatGPTIdentity(await token(), "different-client", "expected-nonce", fetcher() as typeof fetch),
    ).rejects.toThrow();
  });
  it("rejects an invalid signature", async () => {
    const other = await generateKeyPair("RS256");
    const signed = await new SignJWT({ nonce: "expected-nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://auth.openai.com")
      .setAudience("issued-client")
      .setSubject("account-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(
      verifyChatGPTIdentity(signed, "issued-client", "expected-nonce", fetcher() as typeof fetch),
    ).rejects.toThrow();
  });
  it("rejects an expired token", async () => {
    const signed = await new SignJWT({ nonce: "expected-nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://auth.openai.com")
      .setAudience("issued-client")
      .setSubject("account-1")
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(keys.privateKey);
    await expect(
      verifyChatGPTIdentity(signed, "issued-client", "expected-nonce", fetcher() as typeof fetch),
    ).rejects.toThrow();
  });
  it("refuses to fetch signing keys from an unexpected authority", async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ issuer: "https://auth.openai.com", jwks_uri: "https://attacker.invalid/keys" })),
    );
    await expect(
      verifyChatGPTIdentity(await token(), "issued-client", "expected-nonce", request as typeof fetch),
    ).rejects.toThrow("Unexpected ChatGPT identity authority");
    expect(request).toHaveBeenCalledOnce();
  });
});
