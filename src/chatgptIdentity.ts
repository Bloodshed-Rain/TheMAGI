import { CHATGPT_ISSUER, type VerifiedChatGPTIdentity } from "./chatgptOAuth";

export async function verifyChatGPTIdentity(
  token: string,
  clientId: string,
  nonce?: string,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedChatGPTIdentity> {
  const { createRemoteJWKSet, jwtVerify, customFetch } = await import("jose");
  const response = await fetcher(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Could not verify the ChatGPT sign-in authority. Try again.");
  const metadata = (await response.json()) as { issuer: string; jwks_uri: string };
  const jwksUrl = new URL(metadata.jwks_uri);
  if (metadata.issuer !== CHATGPT_ISSUER || jwksUrl.origin !== CHATGPT_ISSUER)
    throw new Error("Unexpected ChatGPT identity authority");
  const { payload } = await jwtVerify(token, createRemoteJWKSet(jwksUrl, { [customFetch]: fetcher }), {
    issuer: CHATGPT_ISSUER,
    audience: clientId,
    algorithms: ["RS256", "ES256"],
    requiredClaims: ["sub", "exp", "iat"],
  });
  if (!payload.sub || (nonce && payload.nonce !== nonce)) throw new Error("ChatGPT identity verification failed");
  return { subject: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}
