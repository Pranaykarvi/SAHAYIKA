import { defineConfig } from "drizzle-kit";

// Migrations run as the table owner (it creates tables, roles, and policies);
// the runtime DATABASE_URL is the RLS-constrained app role and must not be
// used here, or grants and policies would fail to apply.
const url = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "ADMIN_DATABASE_URL (or DATABASE_URL) must be set to run drizzle-kit commands",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: { url },
});
