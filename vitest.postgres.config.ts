import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["prisma/**/*.integration.test.ts"],
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
