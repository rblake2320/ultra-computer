import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "shared"),
    },
  },
});
