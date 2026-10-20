import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z, type ZodTypeAny } from "zod";

import { capabilityProfileResponseSchema, capabilityProfileUpsertRequestSchema } from "../../validation/capability-profiles";
import { errorResponseSchema } from "../../validation/errors";
import { groupDecisionRequestSchema, groupDecisionResponseSchema } from "../../validation/group-decisions";
import { healthResponseSchema } from "../../validation/health";
import { ledgerEntryCreateRequestSchema, ledgerEntryResponseSchema, ledgerListQuerySchema, ledgerPageSchema, ledgerReverseRequestSchema } from "../../validation/ledger-entries";
import { groupMatchHistoryItemSchema, matchDetailSchema, matchingRunRequestSchema, matchQueueItemSchema, matchResponseSchema, matchWithOpportunitySchema, readinessOverrideRequestSchema } from "../../validation/matches";
import { opportunityCreateRequestSchema, opportunityIngestRequestSchema, opportunityListQuerySchema, opportunityResponseSchema, opportunitySummarySchema } from "../../validation/opportunities";
import { idParamSchema } from "../../validation/params";
import { distributionQuerySchema, matchDistributionReportSchema, overviewSchema } from "../../validation/reports";
import { consentUpdateRequestSchema, selfHelpGroupResponseSchema } from "../../validation/self-help-groups";
import { meResponseSchema } from "../../validation/user-profiles";
import { verificationRecordResponseSchema, verifyMatchRequestSchema } from "../../validation/verification-records";

// The OpenAPI document is generated from the Zod schemas in src/validation —
// the single source of truth for every shape crossing the API boundary. It is
// never hand-written; pnpm openapi:generate rewrites backend/openapi.json.
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Supabase Auth JWT, obtained by the frontend directly from Supabase. The backend only verifies.",
});

const ErrorResponse = registry.register("ErrorResponse", errorResponseSchema);
// Registered by name so the frontend gets a reusable OpportunitySummary type.
registry.register("OpportunitySummary", opportunitySummarySchema);
const Health = registry.register("HealthResponse", healthResponseSchema);
const Me = registry.register("Me", meResponseSchema);
const Opportunity = registry.register("Opportunity", opportunityResponseSchema);
const OpportunityIngestRequest = registry.register("OpportunityIngestRequest", opportunityIngestRequestSchema);
const OpportunityCreateRequest = registry.register("OpportunityCreateRequest", opportunityCreateRequestSchema);
const OpportunityListQuery = registry.register("OpportunityListQuery", opportunityListQuerySchema);
const Group = registry.register("Group", selfHelpGroupResponseSchema);
const ConsentUpdateRequest = registry.register("ConsentUpdateRequest", consentUpdateRequestSchema);
const CapabilityProfile = registry.register("CapabilityProfile", capabilityProfileResponseSchema);
const CapabilityProfileUpsertRequest = registry.register("CapabilityProfileUpsertRequest", capabilityProfileUpsertRequestSchema);
const Match = registry.register("Match", matchResponseSchema);
const MatchWithOpportunity = registry.register("MatchWithOpportunity", matchWithOpportunitySchema);
const MatchQueueItem = registry.register("MatchQueueItem", matchQueueItemSchema);
const MatchDetail = registry.register("MatchDetail", matchDetailSchema);
const GroupMatchHistoryItem = registry.register("GroupMatchHistoryItem", groupMatchHistoryItemSchema);
const Overview = registry.register("Overview", overviewSchema);
const MatchingRunRequest = registry.register("MatchingRunRequest", matchingRunRequestSchema);
const VerifyMatchRequest = registry.register("VerifyMatchRequest", verifyMatchRequestSchema);
const VerificationRecord = registry.register("VerificationRecord", verificationRecordResponseSchema);
const ReadinessOverrideRequest = registry.register("ReadinessOverrideRequest", readinessOverrideRequestSchema);
const GroupDecisionRequest = registry.register("GroupDecisionRequest", groupDecisionRequestSchema);
const GroupDecision = registry.register("GroupDecision", groupDecisionResponseSchema);
const LedgerEntry = registry.register("LedgerEntry", ledgerEntryResponseSchema);
const LedgerPage = registry.register("LedgerPage", ledgerPageSchema);
const LedgerEntryCreateRequest = registry.register("LedgerEntryCreateRequest", ledgerEntryCreateRequestSchema);
const LedgerReverseRequest = registry.register("LedgerReverseRequest", ledgerReverseRequestSchema);
const MatchDistributionReport = registry.register("MatchDistributionReport", matchDistributionReportSchema);
const IdParam = idParamSchema;

function jsonBody(schema: ZodTypeAny) {
  return { content: { "application/json": { schema } }, required: true };
}

function jsonResponse(description: string, schema: ZodTypeAny) {
  return { description, content: { "application/json": { schema } } };
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Request validation failed",
  401: "Missing, expired, or otherwise invalid bearer token",
  403: "Authenticated but not permitted (role or scope)",
  404: "Not found or not visible to this account",
  501: "Contract defined; implementation arrives in a later stage",
};

function errorResponses(...codes: number[]) {
  return Object.fromEntries(
    codes.map((code) => [
      code,
      jsonResponse(ERROR_DESCRIPTIONS[code] ?? "Error", ErrorResponse),
    ]),
  );
}

const secured = [{ bearerAuth: [] }];

registry.registerPath({
  method: "post",
  path: "/opportunities/ingest",
  tags: ["opportunities"],
  summary: "Ingest a raw opportunity document (social worker)",
  security: secured,
  request: { body: jsonBody(OpportunityIngestRequest) },
  responses: {
    201: jsonResponse("Opportunity created from the document", Opportunity),
    ...errorResponses(400, 401, 403, 501),
  },
});

registry.registerPath({
  method: "post",
  path: "/opportunities",
  tags: ["opportunities"],
  summary: "Create an opportunity manually (social worker)",
  security: secured,
  request: { body: jsonBody(OpportunityCreateRequest) },
  responses: {
    201: jsonResponse("Opportunity created", Opportunity),
    ...errorResponses(400, 401, 403, 501),
  },
});

registry.registerPath({
  method: "get",
  path: "/opportunities",
  tags: ["opportunities"],
  summary: "List opportunities, filterable by deadline (social worker)",
  security: secured,
  request: { query: OpportunityListQuery },
  responses: {
    200: jsonResponse("Opportunities", z.array(Opportunity)),
    ...errorResponses(400, 401, 403, 501),
  },
});

registry.registerPath({
  method: "get",
  path: "/opportunities/{id}",
  tags: ["opportunities"],
  summary: "Fetch one opportunity (social worker)",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse("Opportunity", Opportunity),
    ...errorResponses(400, 401, 403, 404, 501),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups",
  tags: ["groups"],
  summary: "List groups in the requesting social worker's federation",
  security: secured,
  responses: {
    200: jsonResponse("Groups", z.array(Group)),
    ...errorResponses(401, 403, 501),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups/{id}",
  tags: ["groups"],
  summary: "Fetch one group (social worker, or the group's own bookkeeper)",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse("Group", Group),
    ...errorResponses(400, 401, 403, 404, 501),
  },
});

registry.registerPath({
  method: "patch",
  path: "/groups/{id}/consent",
  tags: ["groups"],
  summary: "Suspend or revoke a group's consent (social worker)",
  security: secured,
  request: { params: IdParam, body: jsonBody(ConsentUpdateRequest) },
  responses: {
    200: jsonResponse(
      "Updated group. Revoking also removes the group from all future matching runs and clears its profile embedding.",
      Group,
    ),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups/{id}/profile",
  tags: ["groups"],
  summary:
    "Fetch a group's capability profile (social worker, or the group's own bookkeeper)",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse("Capability profile", CapabilityProfile),
    ...errorResponses(400, 401, 403, 404, 501),
  },
});

registry.registerPath({
  method: "put",
  path: "/groups/{id}/profile",
  tags: ["groups"],
  summary:
    "Create or replace a group's capability profile; the backend re-embeds it (social worker, or the group's own bookkeeper)",
  security: secured,
  request: { params: IdParam, body: jsonBody(CapabilityProfileUpsertRequest) },
  responses: {
    200: jsonResponse("Capability profile", CapabilityProfile),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/matching/run",
  tags: ["matching"],
  summary: "Run matching for an opportunity (social worker)",
  security: secured,
  request: { body: jsonBody(MatchingRunRequest) },
  responses: {
    201: jsonResponse("Proposed matches created by the run", z.array(Match)),
    ...errorResponses(400, 401, 403, 404, 501),
  },
});

registry.registerPath({
  method: "get",
  path: "/matches/queue",
  tags: ["matches"],
  summary:
    "Proposed matches awaiting verification in the requesting social worker's federation, newest first",
  security: secured,
  responses: {
    200: jsonResponse("Proposed matches", z.array(MatchQueueItem)),
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: "get",
  path: "/matches/{id}",
  tags: ["matches"],
  summary:
    "The verification screen payload: match, cited summary, group profile and ledger position, readiness factors, and hard-filter eliminations",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse("Match detail", MatchDetail),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups/{id}/match-history",
  tags: ["matches"],
  summary:
    "Full match history for a group with outcomes (RLS limits bookkeepers to verified and later)",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse("Match history", z.array(GroupMatchHistoryItem)),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/reports/overview",
  tags: ["reports"],
  summary:
    "Dashboard overview: pending verifications, group count, recent decisions, approaching deadlines",
  security: secured,
  responses: {
    200: jsonResponse("Overview", Overview),
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: "post",
  path: "/matches/{id}/verify",
  tags: ["matches"],
  summary: "Record a verification decision with rationale (social worker)",
  security: secured,
  request: { params: IdParam, body: jsonBody(VerifyMatchRequest) },
  responses: {
    201: jsonResponse("Verification record", VerificationRecord),
    409: jsonResponse("The match already has a verification", ErrorResponse),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "patch",
  path: "/matches/{id}/readiness",
  tags: ["matches"],
  summary:
    "Override the readiness band, always with a reason; the automated band is preserved (social worker)",
  security: secured,
  request: { params: IdParam, body: jsonBody(ReadinessOverrideRequest) },
  responses: {
    200: jsonResponse(
      "Match with override applied; the original band is preserved alongside it",
      Match,
    ),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups/{id}/matches",
  tags: ["matches"],
  summary: "Verified matches for a group (the group's own bookkeeper)",
  description:
    "Returns matches with status 'verified' ONLY. The filter is pinned inside the service function and backed by row-level security; no parameter can widen it (invariant 1).",
  security: secured,
  request: { params: IdParam },
  responses: {
    200: jsonResponse(
      "Verified matches, each with its reasons and the opportunity summary",
      z.array(MatchWithOpportunity),
    ),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/matches/{id}/decision",
  tags: ["matches"],
  summary: "Record the group's own decision on a presented match (bookkeeper)",
  security: secured,
  request: { params: IdParam, body: jsonBody(GroupDecisionRequest) },
  responses: {
    201: jsonResponse(
      "Group decision; createsExternalCommitment is always false — accepting binds the group to nothing outside this platform",
      GroupDecision,
    ),
    409: jsonResponse(
      "No approved verification, or the group already decided",
      ErrorResponse,
    ),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/groups/{id}/ledger",
  tags: ["ledger"],
  summary:
    "List a group's ledger entries (social worker, or the group's own bookkeeper)",
  security: secured,
  request: { params: IdParam, query: ledgerListQuerySchema },
  responses: {
    200: jsonResponse(
      "Ledger entries with running balance, newest first, paginated",
      LedgerPage,
    ),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/groups/{id}/ledger",
  tags: ["ledger"],
  summary: "Append a ledger entry (the group's own bookkeeper); never edits",
  security: secured,
  request: { params: IdParam, body: jsonBody(LedgerEntryCreateRequest) },
  responses: {
    201: jsonResponse("Appended entry", LedgerEntry),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/groups/{id}/ledger/reverse",
  tags: ["ledger"],
  summary:
    "Correct an entry by appending a reversing entry that points at the original (the group's own bookkeeper)",
  security: secured,
  request: { params: IdParam, body: jsonBody(LedgerReverseRequest) },
  responses: {
    201: jsonResponse(
      "The reversing entry (sign inverted, reverses_entry_id set)",
      LedgerEntry,
    ),
    409: jsonResponse("The entry was already reversed", ErrorResponse),
    ...errorResponses(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/reports/distribution",
  tags: ["reports"],
  summary:
    "Match distribution per group over a window, with over-concentration flags",
  security: secured,
  request: { query: distributionQuerySchema },
  responses: {
    200: jsonResponse("Distribution report", MatchDistributionReport),
    ...errorResponses(400, 401, 403),
  },
});

registry.registerPath({
  method: "get",
  path: "/me",
  tags: ["auth"],
  summary: "The authenticated caller's own profile (role and scope)",
  security: secured,
  responses: {
    200: jsonResponse("Caller profile", Me),
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["health"],
  summary: "Liveness probe (public)",
  // security: [] (not omitted) — explicitly public, not accidentally open.
  security: [],
  responses: {
    200: jsonResponse("Service is up", Health),
  },
});

export function buildOpenApiDocument() {
  // OpenAPI 3.1: no `nullable` keyword, so open-shaped fields (details,
  // summary.fields) render as valid schemas; openapi-typescript consumes 3.1.
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Sahayika API",
      version: "0.1.0",
      description:
        "Generated from the Zod schemas in backend/src/validation. Do not edit openapi.json by hand — run pnpm openapi:generate.",
    },
    servers: [{ url: "/api/v1" }],
  });
}
