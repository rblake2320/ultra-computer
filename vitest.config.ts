import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Unit files share the process-wide SQLite storage module. Parallel files
    // can open the same WAL database from multiple Windows workers and fail
    // with SQLITE_IOERR_TRUNCATE (observed on Node 24 CI). Run files serially;
    // tests within each file remain sequential by Vitest default.
    fileParallelism: false,
    globalSetup: ["./tests/unit/globalSetup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 24,
        branches: 20,
        functions: 22,
        lines: 24,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
