import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Stage-6 workflows against the live database: verification, readiness
// override, the group-decision flow (which must be blocked at the DATABASE
// when no approved verification exists), ledger running balance + reversal,
// consent revocation removing a group from future matching runs, and the
// distribution report.
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

const SW = "fafafafa-0000-4000-8000-000000000001";
const BK = "fafafafa-0000-4000-8000-000000000002";
const ADMIN_USER = "fafafafa-0000-4000-8000-000000000003";
const FED = "fafafafa-0000-4000-8000-0000000000f1";
const GROUP = "fafafafa-0000-4000-8000-00000000000a";
const MEMBER = "fafafafa-0000-4000-8000-00000000000e";
const OPP_DECIDED = "fafafafa-0000-4000-8000-0000000000a1";
const OPP_UNVERIFIED = "fafafafa-0000-4000-8000-0000000000a2";
const OPP_FLAGGED = "fafafafa-0000-4000-8000-0000000000a3";
const OPP_RUN_A = "fafafafa-0000-4000-8000-0000000000b1";
const OPP_RUN_B = "fafafafa-0000-4000-8000-0000000000b2";
const MATCH_DECIDED = "fafafafa-0000-4000-8000-0000000000c1";
const MATCH_UNVERIFIED = "fafafafa-0000-4000-8000-0000000000c2";
const MATCH_FLAGGED = "fafafafa-0000-4000-8000-0000000000c3";

const SUMMARY = JSON.stringify({
  whatIsBeingBought: "500 school uniform sets",
  quantity: { amount: 500, unit: "sets" },
  qualitySpec: null,
  deadline: "2027-03-31",
  eligibility: ["Registered women's SHG"],
  paymentTerms: "60% on delivery",
  penalties: null,
  sourceCitations: [
    { field: "whatIsBeingBought", page: 1, quotedText: "500 school uniform sets" },
    { field: "quantity", page: 1, quotedText: "Quantity: 500 sets" },
    { field: "deadline", page: 1, quotedText: "Deadline: 2027-03-31" },
    { field: "eligibility", page: 1, quotedText: "Registered women's SHG" },
    { field: "paymentTerms", page: 1, quotedText: "60% on delivery" },
  ],
});
const REASONS = JSON.stringify([
  {
    signal: "similarity",
    contribution: 0.3,
    explanation: "Seeded for the stage-6 workflow tests.",
  },
]);

describe.skipIf(!adminUrl || !appUrl)("stage 6 workflows", () => {
  let admin: postgres.Sql;
  let matchesSvc: typeof import("./matches");
  let ledgerSvc: typeof import("./ledger");
  let groupsSvc: typeof import("./groups");
  let reportsSvc: typeof import("./reports");
  let matchingSvc: typeof import("./matching");
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    if (!adminUrl) throw new Error("ADMIN_DATABASE_URL required");
    process.env.AI_EXTRACTION_PROVIDER = "fake";
    process.env.AI_EMBEDDING_PROVIDER = "fake";
    process.env.REPORTS_CONCENTRATION_SHARE = "0.3";

    admin = postgres(adminUrl);
    await admin`TRUNCATE self_help_groups, members, capability_profiles, opportunities, matches, verification_records, group_decisions, ledger_entries, user_profiles, match_eliminations CASCADE`;

    await admin`INSERT INTO self_help_groups (id, name, federation_id, village, district, state, formed_on, consent_status, is_synthetic) VALUES
      (${GROUP}, 'Flows Group', ${FED}, 'V', 'D', 'S', '2021-01-01', 'active', true)`;
    // Group first: the bookkeeper's role-shape CHECK requires group_id.
    await admin`INSERT INTO user_profiles (supabase_user_id, role, federation_id, group_id, display_name) VALUES
      (${SW}, 'social_worker', ${FED}, NULL, 'SW Flows'),
      (${BK}, 'bookkeeper', NULL, ${GROUP}, 'BK Flows'),
      (${ADMIN_USER}, 'admin', NULL, NULL, 'Admin Flows')`;
    await admin`INSERT INTO members (id, group_id, name, phone, preferred_language, joined_on, is_synthetic) VALUES
      (${MEMBER}, ${GROUP}, 'Member One', '0000000000', 'hi', '2021-01-01', true)`;

    const vec = `[${Array(1536).fill("0.01").join(",")}]`;
    await admin`INSERT INTO capability_profiles (group_id, skills, certifications, capacity, equipment, embedding, is_synthetic) VALUES
      (${GROUP}, '{"tailoring"}', '[]', '[{"product":"school uniforms","unitsPerMonth":2000,"minLeadTimeDays":10}]', '{}', ${vec}::vector, true)`;
    await admin`INSERT INTO opportunities (id, source, title, summary, deadline, size_class, embedding, is_synthetic) VALUES
      (${OPP_DECIDED}, 'seed', 'Opp decided', ${SUMMARY}, '2027-03-31', 'medium', ${vec}::vector, true),
      (${OPP_UNVERIFIED}, 'seed', 'Opp unverified', ${SUMMARY}, '2027-03-31', 'medium', ${vec}::vector, true),
      (${OPP_FLAGGED}, 'seed', 'Opp flagged', ${SUMMARY}, '2027-03-31', 'medium', ${vec}::vector, true),
      (${OPP_RUN_A}, 'seed', 'Opp run A', ${SUMMARY}, '2027-03-31', 'medium', ${vec}::vector, true),
      (${OPP_RUN_B}, 'seed', 'Opp run B', ${SUMMARY}, '2027-03-31', 'medium', ${vec}::vector, true)`;
    await admin`INSERT INTO matches (id, group_id, opportunity_id, score, reasons, readiness_band, status) VALUES
      (${MATCH_DECIDED}, ${GROUP}, ${OPP_DECIDED}, 0.7, ${REASONS}, 'ready', 'proposed'),
      (${MATCH_UNVERIFIED}, ${GROUP}, ${OPP_UNVERIFIED}, 0.6, ${REASONS}, 'stretch', 'proposed'),
      (${MATCH_FLAGGED}, ${GROUP}, ${OPP_FLAGGED}, 0.5, ${REASONS}, 'ready', 'proposed')`;

    matchesSvc = await import("./matches");
    ledgerSvc = await import("./ledger");
    groupsSvc = await import("./groups");
    reportsSvc = await import("./reports");
    matchingSvc = await import("./matching");
    ({ closeDb } = await import("../db/client"));
  });

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (admin) await admin.end();
  });

  it("a match with no approved verification cannot reach a group decision — two independent refusals", async () => {
    // For the bookkeeper the unverified match does not even exist: the RLS
    // read policy (invariant 1) hides it before any status machinery runs.
    await expect(
      matchesSvc.recordGroupDecision(BK, MATCH_UNVERIFIED, {
        decision: "accepted",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });

    // An admin CAN see proposed matches, so their attempt reaches the
    // service's move-to-presented — and the stage-1 database trigger refuses
    // it. This is the guard being exercised through the service, exactly as
    // intended.
    await expect(
      matchesSvc.recordGroupDecision(ADMIN_USER, MATCH_UNVERIFIED, {
        decision: "accepted",
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED", statusCode: 409 });

    // Nothing moved, nothing was written.
    const rows =
      await admin`SELECT status FROM matches WHERE id = ${MATCH_UNVERIFIED}`;
    expect(rows[0]?.status).toBe("proposed");
    const decisions =
      await admin`SELECT count(*)::int AS n FROM group_decisions WHERE match_id = ${MATCH_UNVERIFIED}`;
    expect(Number(decisions[0]?.n)).toBe(0);
  });

  it("needs_information flags without moving the match, and still blocks decisions", async () => {
    const record = await matchesSvc.verifyMatch(SW, MATCH_UNVERIFIED, {
      decision: "needs_information",
      rationale: "Capacity numbers look stale; please re-confirm with the group.",
    });
    expect(record.decision).toBe("needs_information");
    const rows =
      await admin`SELECT status FROM matches WHERE id = ${MATCH_UNVERIFIED}`;
    expect(rows[0]?.status).toBe("proposed");
    // Still not approved — the database guard keeps refusing.
    await expect(
      matchesSvc.recordGroupDecision(ADMIN_USER, MATCH_UNVERIFIED, {
        decision: "accepted",
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
  });

  it("approval moves the match to verified; a second verification is refused", async () => {
    const record = await matchesSvc.verifyMatch(SW, MATCH_DECIDED, {
      decision: "approved",
      rationale: "Capacity and certifications check out against the tender.",
    });
    expect(record.decision).toBe("approved");
    const rows =
      await admin`SELECT status FROM matches WHERE id = ${MATCH_DECIDED}`;
    expect(rows[0]?.status).toBe("verified");

    await expect(
      matchesSvc.verifyMatch(SW, MATCH_DECIDED, {
        decision: "rejected",
        rationale: "Changing my mind should not be possible this way.",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_VERIFIED", statusCode: 409 });
  });

  it("readiness override preserves the original band and both are returned", async () => {
    const match = await matchesSvc.overrideReadiness(SW, MATCH_DECIDED, {
      band: "stretch",
      reason: "District infrastructure makes this harder than the ledgers suggest.",
    });
    expect(match.readinessBand).toBe("ready"); // untouched
    expect(match.readinessOverride).toBe("stretch");
    expect(match.readinessOverrideReason).toContain("District infrastructure");
  });

  it("the bookkeeper surface returns verified matches with reasons and opportunity summary", async () => {
    const list = await matchesSvc.listVerifiedMatchesForGroup(BK, GROUP);
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item?.id).toBe(MATCH_DECIDED);
    expect(item?.reasons.length).toBeGreaterThan(0);
    expect(item?.opportunity.title).toBe("Opp decided");
    expect(item?.opportunity.summary?.whatIsBeingBought).toContain("uniform");
    expect(item?.readinessBand).toBe("ready");
    expect(item?.readinessOverride).toBe("stretch");
  });

  it("a verified match can be decided; the response disclaims external commitment", async () => {
    const decision = await matchesSvc.recordGroupDecision(BK, MATCH_DECIDED, {
      decision: "accepted",
      note: "The group voted to take this order.",
    });
    expect(decision.recordedBy).toBe(BK);
    expect(decision.createsExternalCommitment).toBe(false);
    const rows =
      await admin`SELECT status FROM matches WHERE id = ${MATCH_DECIDED}`;
    expect(rows[0]?.status).toBe("accepted");

    await expect(
      matchesSvc.recordGroupDecision(BK, MATCH_DECIDED, { decision: "declined" }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("ledger: append, running balance newest-first, pagination, reversal with inverted sign", async () => {
    await ledgerSvc.appendLedgerEntry(BK, GROUP, {
      kind: "thrift",
      amount: 100,
      entryDate: "2026-09-01",
      memberId: MEMBER,
    });
    const expense = await ledgerSvc.appendLedgerEntry(BK, GROUP, {
      kind: "expense",
      amount: 40,
      entryDate: "2026-09-15",
    });

    let page = await ledgerSvc.listLedgerEntries(BK, GROUP);
    expect(page.total).toBe(2);
    // Newest first: the expense leads, with the balance after it.
    expect(page.entries[0]?.kind).toBe("expense");
    expect(page.entries[0]?.runningBalance).toBe("60.00");
    expect(page.entries[1]?.runningBalance).toBe("100.00");

    const reversal = await ledgerSvc.reverseLedgerEntry(BK, GROUP, {
      entryId: expense.id,
      reason: "Entered against the wrong group meeting.",
    });
    expect(reversal.amount).toBe("-40.00");
    expect(reversal.reversesEntryId).toBe(expense.id);
    expect(reversal.note).toContain("wrong group");

    page = await ledgerSvc.listLedgerEntries(BK, GROUP, { limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.entries).toHaveLength(2);
    // The reversal restores the balance.
    expect(page.entries[0]?.runningBalance).toBe("100.00");

    await expect(
      ledgerSvc.reverseLedgerEntry(BK, GROUP, {
        entryId: expense.id,
        reason: "Twice should not work.",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
  });

  it("the distribution report counts per group and flags over-concentration", async () => {
    const report = await reportsSvc.getMatchDistribution(SW, 90);
    expect(report.federationId).toBe(FED);
    expect(report.concentrationThreshold).toBe(0.3);
    const group = report.byGroup.find((g) => g.groupId === GROUP);
    expect(group).toBeDefined();
    expect(group?.totalMatches).toBeGreaterThanOrEqual(3);
    // This group holds every active match in the federation — flagged.
    expect(group?.shareOfActiveMatches).toBe(1);
    expect(group?.overConcentrated).toBe(true);
  });

  it("revoking consent removes the group from the next matching run and nulls its embedding", async () => {
    // Present in a run while consent is active...
    const before = await matchingSvc.runMatching(SW, OPP_RUN_A);
    expect(before.map((m) => m.groupId)).toContain(GROUP);

    const updated = await groupsSvc.updateGroupConsent(SW, GROUP, {
      consentStatus: "revoked",
      reason: "The group asked to leave the platform.",
    });
    expect(updated.consentStatus).toBe("revoked");

    const profile =
      await admin`SELECT embedding IS NULL AS embedding_nulled FROM capability_profiles WHERE group_id = ${GROUP}`;
    expect(profile[0]?.embedding_nulled).toBe(true);

    // ...and absent from the next run, against a fresh opportunity.
    const after = await matchingSvc.runMatching(SW, OPP_RUN_B);
    expect(after.map((m) => m.groupId)).not.toContain(GROUP);
    const rows =
      await admin`SELECT count(*)::int AS n FROM matches WHERE opportunity_id = ${OPP_RUN_B} AND group_id = ${GROUP}`;
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
