import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./document";

interface Operation {
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: unknown;
  description?: string;
}

const ENDPOINTS: Array<[method: string, path: string]> = [
  ["post", "/opportunities/ingest"],
  ["post", "/opportunities"],
  ["get", "/opportunities"],
  ["get", "/opportunities/{id}"],
  ["get", "/groups"],
  ["get", "/groups/{id}"],
  ["patch", "/groups/{id}/consent"],
  ["get", "/groups/{id}/profile"],
  ["put", "/groups/{id}/profile"],
  ["post", "/matching/run"],
  ["get", "/matches/queue"],
  ["get", "/matches/{id}"],
  ["post", "/matches/{id}/verify"],
  ["patch", "/matches/{id}/readiness"],
  ["get", "/groups/{id}/matches"],
  ["post", "/matches/{id}/decision"],
  ["get", "/groups/{id}/ledger"],
  ["post", "/groups/{id}/ledger"],
  ["post", "/groups/{id}/ledger/reverse"],
  ["get", "/reports/distribution"],
  ["get", "/reports/overview"],
  ["get", "/groups/{id}/match-history"],
  ["get", "/me"],
  ["get", "/health"],
];

const doc = buildOpenApiDocument();
const paths = doc.paths as Record<string, Record<string, Operation>>;

describe("OpenAPI document", () => {
  it("is OpenAPI 3.1 with the /api/v1 server", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers?.[0]?.url).toBe("/api/v1");
  });

  it.each(ENDPOINTS)("documents %s %s", (method, path) => {
    const operation = paths[path]?.[method];
    expect(operation, `${method} ${path} missing`).toBeDefined();
    expect(operation?.responses, "responses missing").toBeDefined();
    const codes = Object.keys(operation?.responses ?? {});
    expect(codes.some((code) => code.startsWith("2"))).toBe(true);
  });

  it.each(
    ENDPOINTS.filter(([method]) => method !== "get"),
  )("%s %s declares a request body", (method, path) => {
    expect(paths[path]?.[method]?.requestBody).toBeDefined();
  });

  it("secures every endpoint except /health", () => {
    for (const [method, path] of ENDPOINTS) {
      const operation = paths[path]?.[method];
      if (path === "/health") {
        expect(operation?.security).toEqual([]);
      } else {
        expect(operation?.security, `${method} ${path}`).toEqual([
          { bearerAuth: [] },
        ]);
      }
    }
  });

  it("registers every schema as a named component", () => {
    const schemas = Object.keys(
      (doc.components?.schemas ?? {}) as Record<string, unknown>,
    );
    for (const name of [
      "ErrorResponse",
      "Opportunity",
      "Group",
      "CapabilityProfile",
      "Match",
      "VerificationRecord",
      "GroupDecision",
      "LedgerEntry",
      "MatchDistributionReport",
    ]) {
      expect(schemas, `${name} missing from components`).toContain(name);
    }
  });

  it("pins the bookkeeper match list to verified in the contract text", () => {
    expect(paths["/groups/{id}/matches"]?.get?.description).toMatch(
      /'verified' ONLY/,
    );
  });
});
