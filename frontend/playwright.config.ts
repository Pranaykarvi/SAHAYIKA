import { defineConfig } from "@playwright/test";

// Runs against an already-running stack: backend on 4000, frontend on 3000,
// and the local auth stand-in (see backend README, local development). The
// test mutates data, so it expects a seeded database (pnpm db:seed).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
