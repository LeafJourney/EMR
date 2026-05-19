import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// Focused config: unit tests only, no DOM, no Next bundling.
// Tests import pure helper functions from agents and domain modules —
// no Prisma, no network, no globals. Keeps CI fast.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./tests/setup/server-only-mock.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Don't load .env — the transcription module reads env vars, and
    // tests should run deterministically regardless of .env state.
    passWithNoTests: false,
  },
});
