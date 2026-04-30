# RLS_AUDIT.md — PermitCheck Row-Level Security audit

**Status:** PR2.5 deliverable. Audit complete; `017_rls_hardening.sql` drafted in PR2.8 with all five items from §H scoped per Cameron's approval (F2 option (a) via grep verification). File is committed to the branch but not yet applied to prod — awaiting Cameron's explicit go-ahead and the `migration-approved` label.

**Scope:** Every table in `public` that holds user data or feeds user-visible queries. The new schema prescribed in `SPEC.md` §11 (`profiles`, `properties`, `permits` v2, `reports` v2, `report_events`) does **not** exist on prod yet — PR4 lands it. This audit covers the *current* legacy schema only.

**Method:**
1. Read all migrations `001`–`015` end-to-end.
2. Verify against the live Supabase project `unjwbyybzfyhiavorcro` via the MCP server `bc357075-…` (read-only — `pg_tables`, `pg_policies`, `pg_class`, `information_schema.columns`, advisor lints).
3. Cross-check effective state against `CLAUDE.md` §4 / SPEC §4 / SPEC §11.

**Live snapshot (2026-04-30):**
- RLS enabled on `users`, `lookups`, `permits`, `reports`, `summary_feedback`, `watchlist`. None are `FORCE ROW LEVEL SECURITY`.
- Row counts: `lookups=3`, `permits=25`, `reports=2`, `users=0`, `summary_feedback=0`, `watchlist=0`. Prod is sparsely populated but not empty.
- Supabase advisor `security` lints: 1 finding — `rls_enabled_no_policy` on `summary_feedback` (intentional; see §F).

> The migration ledger is out of sync with reality (only `001/002/003` are recorded in `supabase_migrations.schema_migrations`, but every column and policy from `004`–`015` exists). That separate finding is tracked in `MIGRATION_LEDGER_AUDIT.md` and `DECISIONS.md` D25. This RLS audit treats the live DB as the source of truth for *effective* policy state.

**Trigger check (PR2.5 acceptance criterion):** `SPEC.md` §12 says "propose `017_rls_hardening.sql` if any `FOR ALL USING (true)` survives for non-service roles." **The strict trigger is NOT met.** Migration `010` dropped all three offending policies. There are still gaps worth fixing — see §G — but none meet the literal trigger.

-----

## Legend

- ✅ Policy is correct given the table's role and matches CLAUDE/SPEC intent.
- ⚠️ Policy is acceptable today but exposes a foreseeable risk under upcoming PRs (PR4 schema, PR8 magic-link, etc.).
- ❌ Policy is wrong, missing, or contradicts CLAUDE/SPEC.

The service role key bypasses RLS entirely. Service-role policies (`auth.role() = 'service_role'`) are functionally redundant, but Supabase convention keeps them as belt-and-suspenders documentation. Their *absence* on a table is not a security hole — it just means we rely solely on the bypass.

-----

## A. `public.users`

**RLS:** enabled (not forced).

**Policies (live):**
| Policy | cmd | qual | grade |
|---|---|---|---|
| `Users can read own profile` | SELECT | `auth.uid() = id` | ✅ |
| `Users can update own profile` | UPDATE | `auth.uid() = id` | ⚠️ |

**Findings:**
- ✅ Self-read is correct.
- ⚠️ The UPDATE policy has `USING` but **no `WITH CHECK`**. A user can rewrite *any* column of their own row, including `is_admin` (added in `014`), `subscription_status` (added in `008`), `stripe_customer_id`, `plan_type`. Today this is moot because no client calls `users` UPDATE through the anon key — all writes go through API routes with the service role. But the policy *as written* would let a determined caller using a logged-in session bump themselves to `is_admin = true`.
- ❌ **No INSERT policy.** All current `users` inserts happen server-side after Supabase Auth signup. PR8's magic-link migration may want a row-level trigger or an explicit INSERT policy gated to `auth.uid() = id` to keep the new flow on the same RLS posture instead of routing every signup through the service role.
- No DELETE policy — covered by `ON DELETE CASCADE` from `auth.users`.
- No service_role policy — relies on bypass.

**Hardening candidates for 017:**
1. Add `WITH CHECK` to the UPDATE policy that locks down privileged columns (e.g. `WITH CHECK (auth.uid() = id AND is_admin IS NOT DISTINCT FROM (SELECT is_admin FROM users WHERE id = auth.uid()) AND subscription_status IS NOT DISTINCT FROM ...)`), or — preferred — drop the SELF UPDATE policy entirely and route all profile edits through Server Actions on the service role.
2. Decide INSERT posture before PR8.

-----

## B. `public.lookups`

**RLS:** enabled (not forced).

**Policies (live):**
| Policy | cmd | qual | grade |
|---|---|---|---|
| `Users can view own lookups` | SELECT | `auth.uid() = user_id` | ✅ |
| `service role full access` | ALL | `auth.role() = 'service_role'` | ✅ |

**Findings:**
- ✅ The original `Service role can manage lookups` (`FOR ALL USING (true)`) from `001` was dropped by `010`. The replacement from `002` correctly scopes to `auth.role() = 'service_role'`.
- ✅ Anonymous lookups (rows with `user_id IS NULL`) are unreadable via RLS by anon/authenticated. Payment-gated public reads happen through the API layer with the service role — matches the explicit comment in `010` ("payment gating belongs in the API layer").
- No INSERT/UPDATE/DELETE policies for end users — all writes flow through Server Actions / API routes on the service role. Matches `CLAUDE.md` §11 ("Only the service role writes to `properties`, `permits`, `reports`, and `report_events`"); the same rule applies to legacy `lookups`.

**Hardening candidates for 017:** none required. Already conformant.

-----

## C. `public.permits`

**RLS:** enabled (not forced).

**Policies (live):**
| Policy | cmd | qual | grade |
|---|---|---|---|
| `Permits follow lookup access` | SELECT | `EXISTS (SELECT 1 FROM lookups WHERE lookups.id = permits.lookup_id AND lookups.user_id = auth.uid())` | ✅ |
| `service role full access` | ALL | `auth.role() = 'service_role'` | ✅ |

**Findings:**
- ✅ `010` dropped two earlier policies that broke the model: (a) the `FOR ALL USING (true)` "Service role can manage permits" from `001`, and (b) the `public read after payment` policy from `003` which let any anon/authenticated caller read permits for *any* paid lookup via REST (since `payment_status='paid'` is not user-scoped). The replacement is correct.
- ✅ Permits inherit access from their owning lookup. Anonymous lookups remain inaccessible via RLS — payment-gated reads go through the API.
- No write policies for end users — service-role only. Matches the rule.

**Hardening candidates for 017:** none required.

-----

## D. `public.reports`

**RLS:** enabled (not forced).

**Policies (live):**
| Policy | cmd | qual | grade |
|---|---|---|---|
| `Reports follow lookup access` | SELECT | `EXISTS (SELECT 1 FROM lookups WHERE lookups.id = reports.lookup_id AND lookups.user_id = auth.uid())` | ✅ |
| *(no service_role policy)* | — | — | ⚠️ |

**Findings:**
- ✅ The SELECT policy correctly scopes reports to the lookup owner.
- ⚠️ **Migration `010` dropped `Service role can manage reports` (`FOR ALL USING (true)`) but did not recreate a scoped replacement** the way `002` did for `lookups` and `permits`. Functionally fine — the service role bypasses RLS regardless — but it leaves `reports` as the only user-data table without an explicit service-role policy. If a future migration ever flips `FORCE ROW LEVEL SECURITY` on this table (which forces RLS to apply *even to* the table owner / service role context in some configurations), writes will silently break. This is finding **F1** in §G.
- ✅ Token-based public PDF downloads (`download_token`, added in `004`) correctly do **not** widen RLS — token verification happens in the API layer at `/api/report/[token]/...`. Anon/authenticated cannot read `reports` rows by RLS regardless of token.
- No write policies for end users — service-role only.

**Hardening candidates for 017:** recreate the scoped service-role policy (F1).

-----

## E. `public.watchlist`

**RLS:** enabled (not forced).

**Policies (live):**
| Policy | cmd | qual | grade |
|---|---|---|---|
| `Service role full access` | ALL | `auth.role() = 'service_role'` (with matching `WITH CHECK`) | ⚠️ |

**Findings:**
- ⚠️ The only policy is service-role. End users cannot read or write their *own* watchlist rows via the anon/authenticated key. This is by design — watchlist mutations and reads currently go through API routes (`/api/watchlist/*`) on the service role. CLAUDE.md §4 says new mutations should be Server Actions, which would keep this posture. Still flagging because it's a non-obvious shape for anyone who later tries to query the watchlist directly from a Client Component and finds an empty result set.
- The `WITH CHECK` on this one is correctly populated, unlike `users.UPDATE`.

**Hardening candidates for 017:** none required. Optionally add an explicit comment-as-policy or a SELECT policy scoped to `auth.uid() = user_id` if and when watchlist queries move to RSC / Server Actions.

-----

## F. `public.summary_feedback`

**RLS:** enabled (not forced).

**Policies (live):** none.

**Findings:**
- The Supabase advisor flags this with `rls_enabled_no_policy` (level INFO). The state is **intentional** — the comment in `010` reads "No anon/authenticated access — only service role (which bypasses RLS)." Feedback writes happen at `POST /api/report/[id]/feedback` on the service role.
- ⚠️ "Intentional no-policy" is brittle: future contributors reading the advisor lint will be tempted to "fix" it by adding a permissive policy. Recommend a SQL-level `COMMENT ON TABLE public.summary_feedback IS 'Service-role only; the empty policy set is intentional. See migration 010.';` so the design choice is in the database itself, not just in a migration file the next dev may not read.

**Hardening candidates for 017:** add the `COMMENT ON TABLE` (finding **F3**).

-----

## G. Findings summary (named, prioritized)

The strict PR2.5 trigger isn't met, but three concrete gaps are worth proposing for `017_rls_hardening.sql`. **Cameron approves scope before any migration is drafted.**

### F1 — Reports lost its service-role policy in 010 and never got it back
- **Where:** `public.reports`.
- **Why it matters:** Belt-and-suspenders is the project default everywhere else. Inconsistent posture is itself a future-bug magnet (e.g., if anyone enables `FORCE ROW LEVEL SECURITY` on `reports` for compliance reasons, writes break silently).
- **Proposed fix:** add the same `auth.role() = 'service_role'` ALL policy that `002` gave `lookups` and `permits`.
- **Risk:** none. Service role already passes; this just makes the policy explicit.

### F2 — `users.UPDATE` policy has no `WITH CHECK`, allowing self-promotion to `is_admin`
- **Where:** `public.users`.
- **Why it matters:** Today no UI exposes this update path through the anon key, but the policy alone permits a logged-in user issuing a direct PostgREST `PATCH /users?id=eq.<self>` with `{is_admin: true}` to bump themselves to admin. The blast radius is "free reports for the attacker forever" (per `014`'s comment that admins bypass payment).
- **Proposed fix:** either (a) drop the self-UPDATE policy entirely and route profile edits through Server Actions on the service role (cleanest, matches CLAUDE.md §4 direction), or (b) add a `WITH CHECK` that pins privileged columns (`is_admin`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `plan_type`) to their existing values. Option (a) is preferred.
- **Risk:** option (a) requires auditing whether any client code currently writes to `users` directly via the anon key. The onboarding flow (`015`) is a likely candidate — needs a quick `grep` in PR2.6's slipstream or PR8's prep.

### F3 — `summary_feedback` "intentional no-policy" is undocumented at the DB level
- **Where:** `public.summary_feedback`.
- **Why it matters:** Supabase advisor flags it, future contributors will "helpfully" add a permissive policy, weakening the design.
- **Proposed fix:** `COMMENT ON TABLE public.summary_feedback IS '...';` (one line) plus a comment in `017` explaining why no policies exist.
- **Risk:** none.

### Open question for Cameron — INSERT posture on `users` ahead of PR8
Magic-link signup will create `auth.users` rows; the trigger that mirrors them into `public.users` runs on the service role today via the existing `handle_new_user` pattern (if present) or via API-route inserts. PR8's design sets the requirement here. If we want `users` inserts to be RLS-policy-enforced rather than service-role-bypass, an INSERT policy `WITH CHECK (auth.uid() = id)` is the right shape. Decide before PR8, not after.

-----

## H. Proposed scope for `017_rls_hardening.sql` (DO NOT WRITE YET)

Pending Cameron approval on each:

1. **(F1)** Recreate scoped service-role ALL policy on `public.reports`.
2. **(F2, option a)** Drop `Users can update own profile` from `public.users`. Server Actions on the service role become the only write path. Requires verifying no client-side anon-key UPDATE exists today.
3. **(F2, option b — only if 2a is rejected)** Replace `Users can update own profile` with a version that includes a `WITH CHECK` pinning privileged columns.
4. **(F3)** `COMMENT ON TABLE public.summary_feedback IS 'Service-role only; the empty policy set is intentional — see migration 010.';`.
5. **(Optional)** Add `COMMENT ON TABLE` for `lookups`, `permits`, `reports`, `watchlist` summarizing their RLS shape, so future readers of `\d+ <table>` see the intent without opening migration history.

`017` is small (≤30 lines) and idempotent (`DROP POLICY IF EXISTS` / `CREATE POLICY`). It does not touch data. The `users.UPDATE` decision (option a vs b) is the only meaningful design call inside it.

**Blockers before 017 ships:**
- Cameron approves the scope above.
- The migration ledger drift (D25 / `MIGRATION_LEDGER_AUDIT.md`) is reconciled. Without that, `017` cannot be applied via `supabase db push` safely.

-----

*Last updated: 2026-04-30. Author: PR2.5 RLS audit. Live DB verified against Supabase project `unjwbyybzfyhiavorcro`.*
