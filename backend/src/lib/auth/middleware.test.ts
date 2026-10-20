import type { NextFunction, Request, Response } from "express";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type GenerateKeyPairResult,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import type { AuthContext } from "./context";
import {
  createRequireAuth,
  createRequireGroupAccess,
  requireRole,
} from "./middleware";
import { createTokenVerifier } from "./verifyToken";

const ISSUER = "https://test-project.supabase.local/auth/v1";
const AUDIENCE = "authenticated";

const BOOKKEEPER_ID = "11111111-0000-4000-8000-000000000001";
const GROUP_A = "22222222-0000-4000-8000-00000000000a";
const GROUP_B = "22222222-0000-4000-8000-00000000000b";
const FEDERATION_1 = "33333333-0000-4000-8000-000000000001";

const profiles: Record<string, AuthContext> = {
  [BOOKKEEPER_ID]: {
    userId: BOOKKEEPER_ID,
    role: "bookkeeper",
    federationId: null,
    groupId: GROUP_A,
  },
};

let requireAuth: ReturnType<typeof createRequireAuth>;
let privateKey: GenerateKeyPairResult["privateKey"];

const requireGroupAccess = createRequireGroupAccess({
  loadGroupFederationId: async (_userId, groupId) =>
    groupId === GROUP_A || groupId === GROUP_B ? FEDERATION_1 : null,
});

async function signToken(sub: string, options?: { expired?: boolean }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(sub)
    .setIssuedAt(options?.expired ? nowSeconds - 7200 : nowSeconds)
    .setExpirationTime(options?.expired ? nowSeconds - 3600 : nowSeconds + 600)
    .sign(privateKey);
}

function makeReq(
  token?: string,
  params: Record<string, string> = {},
): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    params,
  } as unknown as Request;
}

interface CapturedResponse {
  statusCode: number | null;
  body: unknown;
  res: Response;
}

function makeRes(): CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: null,
    body: undefined,
    res: undefined as unknown as Response,
  };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  captured.res = res as unknown as Response;
  return captured;
}

function makeNext(): { next: NextFunction; called: () => boolean } {
  let wasCalled = false;
  return {
    next: (() => {
      wasCalled = true;
    }) as NextFunction,
    called: () => wasCalled,
  };
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  requireAuth = createRequireAuth({
    verifyToken: createTokenVerifier({
      getKey: createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256" }] }),
      issuer: ISSUER,
      audience: AUDIENCE,
    }),
    loadProfile: async (userId) => profiles[userId] ?? null,
  });
});

describe("auth middleware", () => {
  it("passes a valid token with the correct role", async () => {
    const req = makeReq(await signToken(BOOKKEEPER_ID));
    const { res } = makeRes();
    const authNext = makeNext();

    await requireAuth(req, res, authNext.next);
    expect(authNext.called()).toBe(true);
    expect(req.auth).toMatchObject({
      userId: BOOKKEEPER_ID,
      role: "bookkeeper",
      groupId: GROUP_A,
    });

    const roleNext = makeNext();
    requireRole("bookkeeper")(req, res, roleNext.next);
    expect(roleNext.called()).toBe(true);
  });

  it("returns 403 for a valid token with the wrong role", async () => {
    const req = makeReq(await signToken(BOOKKEEPER_ID));
    const auth = makeRes();
    const authNext = makeNext();
    await requireAuth(req, auth.res, authNext.next);
    expect(authNext.called()).toBe(true);

    const role = makeRes();
    const roleNext = makeNext();
    requireRole("social_worker")(req, role.res, roleNext.next);
    expect(roleNext.called()).toBe(false);
    expect(role.statusCode).toBe(403);
  });

  it("returns 403 when a bookkeeper requests another group's id", async () => {
    const req = makeReq(await signToken(BOOKKEEPER_ID), { groupId: GROUP_B });
    const auth = makeRes();
    await requireAuth(req, auth.res, makeNext().next);

    const access = makeRes();
    const accessNext = makeNext();
    await requireGroupAccess("groupId")(req, access.res, accessNext.next);
    expect(accessNext.called()).toBe(false);
    expect(access.statusCode).toBe(403);
  });

  it("returns 401 for an expired token", async () => {
    const req = makeReq(await signToken(BOOKKEEPER_ID, { expired: true }));
    const captured = makeRes();
    const authNext = makeNext();
    await requireAuth(req, captured.res, authNext.next);
    expect(authNext.called()).toBe(false);
    expect(captured.statusCode).toBe(401);
    expect(captured.body).toMatchObject({
      error: { code: "TOKEN_EXPIRED" },
    });
  });
});
