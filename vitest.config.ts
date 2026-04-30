import { defineConfig } from "vitest/config";

// D22 (vitest alias bug) is scheduled to land in PR6. For now, the
// alias key is left as-is so this PR doesn't expand scope; existing
// tests use relative imports anyway.
export default defineConfig({
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
      // The `server-only` marker package throws when imported outside
      // a Server Component. In tests we're not in a Server Component,
      // so we alias it to an empty module. This lets us unit-test
      // server-only modules (refund.ts, supabase/server.ts, etc.)
      // without server-component runtime.
      "server-only": new URL("./src/__tests__/server-only-shim.ts", import.meta.url).pathname,
    },
  },
  test: {
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
