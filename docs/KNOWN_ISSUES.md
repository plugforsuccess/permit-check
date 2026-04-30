# Known Issues

Tracked failures, deferred bugs, and capture-once-document-once items that
have a deliberate cleanup obligation but no immediate fix.

**Scope rule:** if a known issue can be fixed inside the PR that introduces
or surfaces it, fix it there — don't add it here. This file is for issues
where the fix requires either a future PR (because the cleanup is bundled
with other work) or a future trigger event (because the fix only makes
sense after some other change lands).

Each entry: short heading, what's broken, when it started, where the fix
lives, who/when triggers the fix.

---

## Failing tests in `src/__tests__/summary.test.ts`

**Status:** 3 tests failing. **Surfaced by:** PR2 (when vitest setup
populated env stubs and the full suite became runnable). **Verified
predates this session:** stash-and-rerun on PR2 main showed the same
failures. **Cleanup obligation:** legacy-deletion PR (post-PR12-ish, after
`USE_INNGEST_REPORTS=true` flips and PR8 magic-link closes the
unauthenticated checkout path).

### `returns fallback on API error`

- **Test:** mocks `fetch` with `{ ok: false, status: 500 }` and expects
  `generatePermitSummary([], "55 TRINITY AVE SW")` to throw
  `"Claude API error: 500"`.
- **Actual:** throws `"Cannot read properties of undefined (reading 'ok')"`.
- **Root cause:** `summary.ts` was refactored to wrap the fetch call in
  extra async/timeout logic after the test was authored (last test edit:
  commit `c7c8954`, 2026-03-24). The mock no longer hits the same code
  path that performs the `ok` check; the response object the production
  code inspects is `undefined` at the assertion site.
- **Real bug or test bug?** Test bug — production code's error-throw path
  is correct in practice. The mock setup needs to match the new wrapping.
- **Cleanup:** test deletes when `summary.ts` deletes. No fix in current
  scope.

### `sends correct headers to Claude API`

- **Test:** asserts `mockFetch.toHaveBeenCalledWith(...)` with specific
  headers including `"x-api-key": "test-key"`.
- **Actual:** passes when run in isolation
  (`vitest run src/__tests__/summary.test.ts -t "sends correct headers"`).
  Fails only in full-suite runs.
- **Root cause:** `vi.clearAllMocks()` in `beforeEach` doesn't fully clear
  the call history `toHaveBeenCalledWith` checks against. State from a
  previous test's `mockFetch` invocation leaks through. Test-isolation /
  mock-cleanup bug.
- **Real bug or test bug?** Test bug. Production code is fine.
- **Cleanup:** test deletes when `summary.ts` deletes.

### `sends issued_date and sorts permits chronologically`

- **Test:** feeds two permits (`BP-2024-001` filed January, `BP-2024-002`
  filed June) and asserts via `indexOf` that `BP-2024-001` appears before
  `BP-2024-002` in the prompt body sent to Claude.
- **Actual:** `firstIdx = 565, secondIdx = 460`. `BP-2024-002` appears
  earlier in the string.
- **Root cause:** the actual sort logic in `summary.ts` lines ~175-180
  IS oldest-first and the records-list section reflects that. The
  assertion fails because `analyzePermitPatterns()` (a function that runs
  before the records list) emits signals that mention `BP-2024-002` early
  in the prompt preamble. `indexOf` returns the first match anywhere in
  the string, not the first match in the records section.
- **Real bug or test bug?** Test bug. The code's chronological ordering
  is correct; the test's `indexOf`-based check is fragile and was
  invalidated when the prompt structure grew.
- **Cleanup:** test deletes when `summary.ts` deletes.

### Why all three are out of scope for current PRs

`summary.ts` is the legacy inline path that runs when `USE_INNGEST_REPORTS=false`.
Per PR_ROADMAP and D33, the flag flips to `true` in PR6 (staging same-day,
prod within 48h). Once the flag is on globally and the dual-path window
closes — which happens after the agent loop's eight steps are all
implemented (PR6 + PR9–PR12) and PR8 magic-link removes the D34
anonymous-payment branch — `summary.ts` and `summary.test.ts` both get
deleted in a single legacy-deletion PR.

That PR removes:
- `src/lib/summary.ts`
- `src/__tests__/summary.test.ts`
- `runLegacyInlinePath` from `src/app/api/webhooks/stripe/route.ts`
- The D34 branch logic (per D34 retirement trigger, PR8 deletes its branch)
- Legacy reads from `lookups` / `permits` / `reports` in
  `/api/lookup/[id]/results` and `/api/report/[id]/download` (replaced
  with `reports_v2` / `permits_v2` reads)

All three failing tests evaporate in that PR. No interim fix needed.

### What you should NOT do

- **Don't fix the tests in isolation.** Fixing them now means investing in
  test infrastructure for code that's slated for deletion. Sunk cost.
- **Don't suppress them with `it.skip(...)`.** A skipped test that's never
  un-skipped becomes invisible noise. The vitest output's "X failed"
  signal is the right kind of pressure to land the cleanup PR.
- **Don't rely on these tests' green/red signal as evidence of `summary.ts`
  health.** They're broken in ways unrelated to whether `summary.ts`
  works. Run staging integration tests against real Stripe webhooks
  instead — that's the actual signal until the legacy path goes away.

---

*Owner: Cameron Wiley. Add new entries at the top with a date and the
trigger/cleanup obligation. Old entries stay until the cleanup PR lands;
the cleanup PR removes both the entry and the underlying bug in the
same diff.*
