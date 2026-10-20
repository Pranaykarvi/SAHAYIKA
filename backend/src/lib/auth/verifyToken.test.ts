import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type GenerateKeyPairResult,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createTokenVerifier, type TokenVerifier } from "./verifyToken";

const ISSUER = "https://test-project.supabase.local/auth/v1";
const AUDIENCE = "authenticated";
const USER_ID = "9f8b2a31-0000-4000-8000-000000000001";

let verify: TokenVerifier;
let privateKey: GenerateKeyPairResult["privateKey"];

async function signToken(options?: {
  expired?: boolean;
  audience?: string;
}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(ISSUER)
    .setAudience(options?.audience ?? AUDIENCE)
    .setSubject(USER_ID)
    .setIssuedAt(options?.expired ? nowSeconds - 7200 : nowSeconds)
    .setExpirationTime(options?.expired ? nowSeconds - 3600 : nowSeconds + 600)
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  verify = createTokenVerifier({
    getKey: createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256" }] }),
    issuer: ISSUER,
    audience: AUDIENCE,
  });
});

describe("createTokenVerifier", () => {
  it("accepts a valid token and returns the subject", async () => {
    const result = await verify(await signToken());
    expect(result.userId).toBe(USER_ID);
  });

  it("rejects an expired token with reason 'expired'", async () => {
    await expect(verify(await signToken({ expired: true }))).rejects.toMatchObject(
      { reason: "expired" },
    );
  });

  it("rejects a wrong-audience token with reason 'wrong_audience'", async () => {
    await expect(
      verify(await signToken({ audience: "some-other-service" })),
    ).rejects.toMatchObject({ reason: "wrong_audience" });
  });

  it("rejects a malformed token with reason 'malformed'", async () => {
    await expect(verify("not-a-jwt-at-all")).rejects.toMatchObject({
      reason: "malformed",
    });
  });
});
