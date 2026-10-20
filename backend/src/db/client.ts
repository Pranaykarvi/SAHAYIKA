import { sql } from "drizzle-orm";
import {
  drizzle,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env";
import * as schema from "./schema";

export type DbClient = PostgresJsDatabase<typeof schema>;
export type DbTx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

let client: ReturnType<typeof postgres> | null = null;
let db: DbClient | null = null;

// DATABASE_URL must be the RLS-constrained application role (sahayika_app),
// not the table owner — the owner bypasses row-level security, which would
// silently turn the policy floor off. Migrations use ADMIN_DATABASE_URL.
export function getDb(): DbClient {
  if (db) return db;
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set (the RLS-constrained app role) to access the database",
    );
  }
  client = postgres(env.DATABASE_URL);
  db = drizzle(client, { schema });
  return db;
}

// Every query made on behalf of a user runs through here: a transaction with
// app.current_user_id set transaction-locally, which the RLS policies read.
// RLS is the floor — when a service or controller forgets a check, Postgres
// still refuses rows outside the user's group or federation.
export async function runAsUser<T>(
  userId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_user_id', ${userId}, true)`,
    );
    return fn(tx);
  });
}

// Drizzle wraps database errors; the Postgres error (with .code) is the
// cause. 23505 = unique_violation.
export function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error ? (err.cause ?? err) : err;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: string }).code === "23505"
  );
}

// True when the error came from the invariant-1 trigger (a match moving to
// 'presented' without an approved verification).
export function isVerificationGuardViolation(err: unknown): boolean {
  const cause = err instanceof Error ? (err.cause ?? err) : err;
  const message =
    typeof cause === "object" && cause !== null
      ? String((cause as { message?: unknown }).message ?? "")
      : "";
  return message.includes("invariant 1");
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}
