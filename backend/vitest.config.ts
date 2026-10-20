import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Integration suites share one database and reset it in beforeAll;
    // running files in parallel would race. Unit-only runs lose little.
    fileParallelism: false,
  },
});
