/**
 * No-op shim for the `server-only` marker package, used by vitest only
 * (see `vitest.config.ts`'s `resolve.alias`). Production code imports
 * the real `server-only` which throws if a Client Component pulls in a
 * server module — that protection is intact in production builds.
 *
 * Tests need a noop because we're unit-testing server modules
 * directly, not from a Client Component context.
 */
export {};
