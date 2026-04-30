import { defineConfig } from "vitest/config";

// D22 (vitest alias bug) is scheduled to land in PR6. For now, the
// alias key is left as-is so this PR doesn't expand scope; existing
// tests use relative imports anyway.
export default defineConfig({
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
  test: {
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
