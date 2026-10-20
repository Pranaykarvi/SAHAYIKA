import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Full pipeline against the live database: pgvector retrieval (with consent
// exclusion), hard filters with persisted eliminations, readiness, ranking,
// and the proposed-only write. Fake AI providers are selected by env before
// the dynamic imports, exactly as production selects real ones.
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

const SW = "dcdcdcdc-0000-4000-8000-000000000001";
const FED = "dcdcdcdc-0000-4000-8000-0000000000f1";
const GROUP_OK = "dcdcdcdc-0000-4000-8000-00000000000a";
const GROUP_REVOKED = "dcdcdcdc-0000-4000-8000-00000000000b";
const GROUP_SMALL = "dcdcdcdc-0000-4000-8000-00000000000c";
const GROUP_BUSY = "dcdcdcdc-0000-4000-8000-00000000000d";
const OPP = "dcdcdcdc-0000-4000-8000-0000000000aa";
const OTHER_OPP = "dcdcdcdc-0000-4000-8000-0000000000bb";

const SUMMARY = {
  whatIsBeingBought: "500 school uniform sets for government primary schools",
  quantity: { amount: 500, unit: "sets" },
  qualitySpec: null,
  deadline: "2027-03-31",
  eligibility: ["Registered women's SHG"],
  paymentTerms: "60% on delivery, 40% within 30 days",
  penalties: null,
  sourceCitations: [
    { field: "whatIsBeingBought", page: 1, quotedText: "500 school uniform sets" },
    { field: "quantity", page: 1, quotedText: "Quantity: 500 sets" },
    { field: "deadline", page: 1, quotedText: "Deadline: 2027-03-31" },
    { field: "eligibility", page: 2, quotedText: "Registered women's SHG" },
    { field: "paymentTerms", page: 2, quotedText: "60% on delivery, 40% within 30 days" },
  ],
};

describe.skipIf(!adminUrl || !appUrl)("matching pipeline", () => {
  let admin: postgres.Sql;
  let svc: typeof import("./matching");
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    if (!adminUrl) throw new Error("ADMIN_DATABASE_URL required");
    process.env.AI_EXTRACTION_PROVIDER = "fake";
    process.env.AI_EMBEDDING_PROVIDER = "fake";

    admin = postgres(adminUrl);
    await admin`TRUNCATE self_help_groups, members, capability_profiles, opportunities, matches, verification_records, group_decisions, ledger_entries, user_profiles, match_eliminations CASCADE`;

    await admin`INSERT INTO user_profiles (supabase_user_id, role, federation_id, display_name)
      VALUES (${SW}, 'social_worker', ${FED}, 'SW Matching Test')`;
    await admin`INSERT INTO self_help_groups (id, name, federation_id, village, district, state, formed_on, consent_status, is_synthetic) VALUES
      (${GROUP_OK}, 'Asha Tailoring Collective', ${FED}, 'V-A', 'Alpha', 'Teststate', '2021-01-01', 'active', true),
      (${GROUP_REVOKED}, 'Revoked Uniform Group', ${FED}, 'V-B', 'Alpha', 'Teststate', '2019-01-01', 'revoked', true),
      (${GROUP_SMALL}, 'Two-Loom Weaving Group', ${FED}, 'V-C', 'Alpha', 'Teststate', '2021-01-01', 'active', true),
      (${GROUP_BUSY}, 'Busy Stitching Group', ${FED}, 'V-D', 'Alpha', 'Teststate', '2021-01-01', 'active', true)`;

    // All profiles share one embedding direction so retrieval similarity is
    // identical — the tests assert structural behavior, not vector quality.
    const vec = `[${Array(1536).fill("0.01").join(",")}]`;
    const capacity = (units: number) =>
      JSON.stringify([
        { product: "school uniforms", unitsPerMonth: units, minLeadTimeDays: 15 },
      ]);
    await admin`INSERT INTO capability_profiles (group_id, skills, certifications, capacity, equipment, embedding, is_synthetic) VALUES
      (${GROUP_OK}, '{"tailoring"}', '[]', ${capacity(2000)}, '{}', ${vec}::vector, true),
      (${GROUP_REVOKED}, '{"tailoring"}', '[]', ${capacity(5000)}, '{}', ${vec}::vector, true),
      (${GROUP_SMALL}, '{"weaving"}', '[]', ${capacity(200)}, '{}', ${vec}::vector, true),
      (${GROUP_BUSY}, '{"tailoring"}', '[]', ${capacity(1500)}, '{}', ${vec}::vector, true)`;

    // The busy group already holds an active (proposed) match elsewhere.
    await admin`INSERT INTO opportunities (id, source, title, summary, deadline, size_class, embedding, is_synthetic) VALUES
      (${OPP}, 'seed', 'Uniform tender', ${JSON.stringify(SUMMARY)}, '2027-03-31', 'medium', ${vec}::vector, true),
      (${OTHER_OPP}, 'seed', 'Earlier tender', ${JSON.stringify(SUMMARY)}, '2027-01-31', 'small', ${vec}::vector, true)`;
    await admin`INSERT INTO matches (group_id, opportunity_id, score, reasons, readiness_band, status) VALUES
      (${GROUP_BUSY}, ${OTHER_OPP}, 0.5, '[{"signal":"similarity","contribution":0.3,"explanation":"Seeded active match."}]', 'ready', 'proposed')`;

    svc = await import("./matching");
    ({ closeDb } = await import("../db/client"));
  });

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (admin) await admin.end();
  });

  it("runs the four stages and writes only proposed matches with readable reasons", async () => {
    const results = await svc.runMatching(SW, OPP);

    const groupIds = results.map((m) => m.groupId);
    expect(groupIds).toContain(GROUP_OK);
    expect(groupIds).toContain(GROUP_BUSY);

    // Ordered by descending score.
    const scores = results.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    // Every match explains itself.
    for (const match of results) {
      expect(match.status).toBe("proposed");
      expect(match.reasons.length).toBeGreaterThan(0);
      for (const reason of match.reasons) {
        expect(reason.explanation.length).toBeGreaterThan(10);
      }
    }

    // Nothing but 'proposed' was ever written.
    const statuses =
      await admin`SELECT DISTINCT status FROM matches WHERE opportunity_id = ${OPP}`;
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe("proposed");
  });

  it("a revoked-consent group never appears, in matches or eliminations", async () => {
    const matchRows =
      await admin`SELECT group_id FROM matches WHERE group_id = ${GROUP_REVOKED}`;
    expect(matchRows).toHaveLength(0);
    const eliminationRows =
      await admin`SELECT group_id FROM match_eliminations WHERE group_id = ${GROUP_REVOKED}`;
    expect(eliminationRows).toHaveLength(0);
  });

  it("the capacity-infeasible group was eliminated with a persisted reason naming capacity", async () => {
    const rows =
      await admin`SELECT reason_code, explanation FROM match_eliminations WHERE group_id = ${GROUP_SMALL} AND opportunity_id = ${OPP}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason_code).toBe("capacity_below_quantity");
    expect(String(rows[0]?.explanation)).toContain("200");
    expect(String(rows[0]?.explanation)).toContain("500");
  });

  it("rotation demoted the group holding an active match", async () => {
    const rows =
      await admin`SELECT group_id, score, reasons FROM matches WHERE opportunity_id = ${OPP}`;
    const busy = rows.find((r) => r.group_id === GROUP_BUSY);
    const free = rows.find((r) => r.group_id === GROUP_OK);
    expect(busy).toBeDefined();
    expect(free).toBeDefined();
    const busyReasons = busy?.reasons as Array<{ signal: string; explanation: string }>;
    const rotation = busyReasons.find((r) => r.signal === "rotation");
    expect(rotation?.explanation).toContain("rotation");
    // All signals equal except capacity headroom (OK group has more) and
    // rotation — the busy group must score strictly lower.
    expect(Number(busy?.score)).toBeLessThan(Number(free?.score));
  });

  it("re-running does not duplicate proposals for already-matched groups", async () => {
    const again = await svc.runMatching(SW, OPP);
    expect(again).toHaveLength(0);
    const rows =
      await admin`SELECT count(*)::int AS n FROM matches WHERE opportunity_id = ${OPP}`;
    expect(Number(rows[0]?.n)).toBe(2);
  });
});
