import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listLedgerEntries } from "../services/ledger";
import { closeDb, runAsUser } from "./client";
import { ledgerEntries } from "./schema";

// Integration test against a live Postgres: requires ADMIN_DATABASE_URL (the
// table owner, to seed) and DATABASE_URL (the RLS-constrained sahayika_app
// role). Skipped when they are not set, so plain `pnpm test` stays green
// without a database.
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

const GROUP_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const GROUP_B = "aaaaaaaa-0000-4000-8000-00000000000b";
const FEDERATION_1 = "bbbbbbbb-0000-4000-8000-000000000001";
const FEDERATION_2 = "bbbbbbbb-0000-4000-8000-000000000002";
const BOOKKEEPER_A = "cccccccc-0000-4000-8000-000000000001";
const RECORDER = "dddddddd-0000-4000-8000-000000000001";

describe.skipIf(!adminUrl || !appUrl)(
  "row-level security is the floor under the middleware",
  () => {
    let admin: postgres.Sql;
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      if (!adminUrl) throw new Error("ADMIN_DATABASE_URL required");
      admin = postgres(adminUrl);

      // Local integration database only: reset and seed two groups with one
      // ledger entry each, and a bookkeeper who belongs to group A.
      await admin`TRUNCATE self_help_groups, members, capability_profiles, opportunities, matches, verification_records, group_decisions, ledger_entries, user_profiles CASCADE`;
      await admin`INSERT INTO self_help_groups (id, name, federation_id, village, district, state, formed_on, is_synthetic) VALUES
        (${GROUP_A}, 'Group A', ${FEDERATION_1}, 'Village A', 'District A', 'State A', '2020-01-01', true),
        (${GROUP_B}, 'Group B', ${FEDERATION_2}, 'Village B', 'District B', 'State B', '2020-01-01', true)`;
      await admin`INSERT INTO ledger_entries (group_id, kind, amount, entry_date, recorded_by, is_synthetic) VALUES
        (${GROUP_A}, 'thrift', 100, '2026-10-01', ${RECORDER}, true),
        (${GROUP_B}, 'thrift', 999, '2026-10-01', ${RECORDER}, true)`;
      await admin`INSERT INTO user_profiles (supabase_user_id, role, group_id, display_name) VALUES
        (${BOOKKEEPER_A}, 'bookkeeper', ${GROUP_A}, 'Bookkeeper of Group A')`;

      // The acceptance scenario: an app with the auth middleware DELIBERATELY
      // REMOVED — no requireAuth, no requireRole, no requireGroupAccess — as
      // if a future code path forgot all of them. The handler calls the
      // service directly with bookkeeper A's identity.
      const app = express();
      app.get("/groups/:groupId/ledger", async (req, res) => {
        const entries = await listLedgerEntries(
          BOOKKEEPER_A,
          req.params.groupId ?? "",
        );
        res.json(entries);
      });
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
      });
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
      await closeDb();
      if (admin) await admin.end();
    });

    it("the bookkeeper still sees their own group's ledger", async () => {
      const res = await fetch(`${baseUrl}/groups/${GROUP_A}/ledger`);
      const body = (await res.json()) as {
        entries: Array<{ amount: string }>;
        total: number;
      };
      expect(res.status).toBe(200);
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]?.amount).toBe("100");
    });

    it("another group's ledger comes back empty — RLS refuses the rows with no middleware in the way", async () => {
      // The row exists; only RLS stands between the bookkeeper and it.
      const adminCount =
        await admin`SELECT count(*)::int AS n FROM ledger_entries WHERE group_id = ${GROUP_B}`;
      expect(adminCount[0]?.n).toBe(1);

      const res = await fetch(`${baseUrl}/groups/${GROUP_B}/ledger`);
      const body = (await res.json()) as { entries: unknown[]; total: number };
      expect(res.status).toBe(200);
      expect(body.entries).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it("writing into another group's ledger violates RLS outright", async () => {
      // Drizzle wraps the Postgres error; the RLS violation is the cause.
      await expect(
        runAsUser(BOOKKEEPER_A, (tx) =>
          tx.insert(ledgerEntries).values({
            groupId: GROUP_B,
            kind: "thrift",
            amount: "50",
            entryDate: "2026-10-02",
            recordedBy: BOOKKEEPER_A,
            isSynthetic: true,
          }),
        ),
      ).rejects.toSatisfy((err: unknown) => {
        const cause = err instanceof Error ? (err.cause ?? err) : err;
        return (
          cause instanceof Error && /row-level security/.test(cause.message)
        );
      });
    });
  },
);
