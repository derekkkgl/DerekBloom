import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for pure logic in src/lib (formatting, command parsing, tape math).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Time labels are tested as Derek sees them, in Manila time.
  test: { include: ["src/**/*.test.ts"], env: { TZ: "Asia/Manila" } },
});
