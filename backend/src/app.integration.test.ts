import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// End-to-end through the real app: local JWKS standing in for Supabase, real
// middleware, real error handler. Requires the integration database; skipped
// without it, like rls.integration.test.ts. All env-dependent app modules are
// imported dynamically AFTER SUPABASE_URL points at the local JWKS server.
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

const SOCIAL_WORKER = "eeeeeeee-0000-4000-8000-000000000001";
const FEDERATION = "eeeeeeee-0000-4000-8000-0000000000f1";

describe.skipIf(!adminUrl || !appUrl)("API surface end to end", () => {
  let admin: postgres.Sql;
  let jwksServer: Server;
  let appServer: Server;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    if (!adminUrl) throw new Error("ADMIN_DATABASE_URL required");

    const pair = await generateKeyPair("ES256");
    const jwk = await exportJWK(pair.publicKey);
    jwksServer = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [{ ...jwk, alg: "ES256" }] }));
    });
    await new Promise<void>((resolve) => {
      jwksServer.listen(0, () => resolve());
    });
    const jwksPort = (jwksServer.address() as AddressInfo).port;
    process.env.SUPABASE_URL = `http://127.0.0.1:${jwksPort}`;

    token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
      .setAudience("authenticated")
      .setSubject(SOCIAL_WORKER)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(pair.privateKey);

    admin = postgres(adminUrl);
    await admin`INSERT INTO user_profiles (supabase_user_id, role, federation_id, display_name)
      VALUES (${SOCIAL_WORKER}, 'social_worker', ${FEDERATION}, 'SW End-to-End')
      ON CONFLICT (supabase_user_id) DO NOTHING`;

    const { createApp } = await import("./app");
    const app = createApp();
    await new Promise<void>((resolve) => {
      appServer = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (appServer) appServer.close(() => resolve());
      else resolve();
    });
    await new Promise<void>((resolve) => {
      if (jwksServer) jwksServer.close(() => resolve());
      else resolve();
    });
    const { closeDb } = await import("./db/client");
    await closeDb();
    if (admin) await admin.end();
  });

  // Every endpoint is implemented as of stage 10; the stage-stub 501
  // translation remains covered by the error-handler unit tests.
  it("the queue endpoint serves the authenticated social worker", async () => {
    const res = await fetch(`${baseUrl}/api/v1/matches/queue`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("validates before stubbing: a bad body is a 400, not a 501", async () => {
    const res = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: 42 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
  });

  it("rejects a missing token in the standard error shape", async () => {
    const res = await fetch(`${baseUrl}/api/v1/matches/queue`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "missing bearer token" },
    });
  });

  it("serves /api/v1/health publicly", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
