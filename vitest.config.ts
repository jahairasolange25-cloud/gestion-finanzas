import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/server/__tests__/setup.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
    },
  },
});
