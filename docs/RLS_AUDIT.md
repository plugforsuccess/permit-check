# RLS Audit — PermitCheck

This document enumerates the Row Level Security state Postgres actually
enforces today, after all migrations in `/supabase/migrations/` apply in
order. It is a permanent reference, like `DECISIONS.md` — new findings
go at the top with a date; old entries stay.

Method: read every migration end-to-end and resolve the cumulative
effect on each user-data table. RLS in Postgres composes additively —
multiple `PERMISSIVE` policies on the same (table, command) are
OR'd; missing policies on an enabled table mean default-deny.

-----

## 2026-04-29 — Initial audit (PR2.5)

### What `010_fix_rls_policies.sql` actually changes

This migration is a security tightening. It does **not** add new
permissions; it removes three classes of holes left by 001 and 003.

1. **Drops three `FOR ALL USING (true)` policies from 001:**
   - `"Service role can manage lookups"` on `lookups`
   - `"Service role can manage permits"` on `permits`
   - `"Service role can manage reports"` on `reports`

   The migration's own comment is correct: `USING (true)` applies to
   *every* role, not just service_role. The original 001 policies were
   functionally "RLS off" for the anon and authenticated roles. Dropping
   them is the right call. Service role bypasses RLS regardless, so no
   loss of capability.

2. **Drops the `"public read after payment"` policy from 003 on
   `permits`.** That policy let any anon/authenticated user read permits
   for *any* paid lookup via the Supabase REST API. Payment gating now
   lives in the API layer (`src/app/api/lookup/[id]/results/route.ts`,
   `src/app/api/report/[id]/download/route.ts`) where it can correlate
   the requester to the lookup owner — RLS can't do that for anonymous
   lookups (user_id is NULL).

3. **Replaces `"Permits follow lookup access"` and `"Reports follow
   lookup access"`** with stricter versions that drop the
   `OR lookups.payment_status = 'paid'` branch. After 010, only the
   lookup *owner* (authenticated, `auth.uid() = user_id`) can read
   permits/reports through RLS. Anonymous lookups are unreadable
   through RLS — they must go through service-role API routes.

4. **Creates `summary_feedback` with RLS enabled and zero policies.**
   Comment explicitly states this is intentional: service role bypasses
   RLS, so service-role server code can write; everyone else gets
   default-deny.

010 is correct as written. The remaining issues post-010 are below.

### Effective policy matrix

One row per policy that exists after all migrations 001–015 apply.
"Roles" defaults to `public` (which includes `anon`, `authenticated`,
and `service_role`) when no `TO` clause is specified. `service_role`
bypasses RLS regardless, so the column shows what the policy *would*
do if RLS weren't bypassed — useful for reasoning about anon and
authenticated.

| Table | Policy | Roles (TO) | Cmd | USING | WITH CHECK | Verdict |
|---|---|---|---|---|---|---|
| `users` | Users can read own profile | public | SELECT | `auth.uid() = id` | — | ✅ |
| `users` | Users can update own profile | public | UPDATE | `auth.uid() = id` | **(none)** | ❌ |
| `lookups` | Users can view own lookups | public | SELECT | `auth.uid() = user_id` | — | ✅ |
| `lookups` | service role full access | public | ALL | `auth.role() = 'service_role'` | (defaults to USING) | ⚠️ |
| `permits` | Permits follow lookup access | public | SELECT | `EXISTS lookup WHERE id = permits.lookup_id AND user_id = auth.uid()` | — | ✅ |
| `permits` | service role full access | public | ALL | `auth.role() = 'service_role'` | (defaults to USING) | ⚠️ |
| `reports` | Reports follow lookup access | public | SELECT | `EXISTS lookup WHERE id = reports.lookup_id AND user_id = auth.uid()` | — | ✅ |
| `reports` | (no service-role policy) | — | — | — | — | ⚠️ |
| `summary_feedback` | (no policies; RLS on) | — | — | — | — | ✅ (default-deny intentional) |
| `watchlist` | Service role full access | public | ALL | `auth.role() = 'service_role'` | `auth.role() = 'service_role'` | ⚠️ |

No `FOR ALL USING (true)` policies remain post-010. The closest variants
are the `auth.role() = 'service_role'` checks, which are role-restricted
and harmless (just redundant).

### Verdicts and rationale

#### ❌ users.UPDATE — missing WITH CHECK (CRITICAL)

`010_fix_rls_policies.sql` did not touch the `"Users can update own
profile"` policy from 001. That policy reads:

```sql
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);
```

There is no `WITH CHECK`. In Postgres RLS, an UPDATE without a
`WITH CHECK` clause **lets the user change every column on their row,
including columns they should not control.** An authenticated user can
issue:

```sql
UPDATE public.users
SET is_admin = TRUE,
    plan_type = 'investor',
    subscription_status = 'active',
    stripe_customer_id = '<someone_else>',
    email = 'victim@example.com'
WHERE id = auth.uid();
```

…and the policy permits it. Specific live impacts on this schema:

- **Privilege escalation:** `is_admin` (014) gates the
  free-lookup bypass in `src/app/api/checkout/create/route.ts:86–91`.
  A self-promoted admin gets unlimited free $9.99 / $199 reports.
- **Billing bypass:** `subscription_status = 'active'` (008) makes
  `hasAgentAccess()` return true in
  `src/app/api/checkout/create/route.ts:93–98`, granting unlimited
  searches without paying for the agent plan.
- **Account hijack vector:** changing `email` and
  `stripe_customer_id` lets the user re-link to another customer's
  Stripe records.

This is also a `CLAUDE.md` §4 violation: *"No client-side Supabase
writes, ever."* The very existence of an UPDATE policy on
`authenticated` is the wrong shape — profile updates should go
through Server Actions with the service-role client.

**Severity: critical.** Every additional day in production with this
policy is exposure (per Cameron's framing). No known exploitation
yet, but trivially exploitable from any browser console with a logged-in
session.

#### ⚠️ Redundant `auth.role() = 'service_role'` policies

Three tables (`lookups`, `permits`, `watchlist`) carry policies that
restrict ALL access to the service role. Service role bypasses RLS
entirely — so these policies fire only when *something else* tries
to act as `service_role`, which isn't a real scenario. They're noise,
not security holes. Recommend dropping for consistency, but not
urgent.

#### ⚠️ `reports` has no service-role policy at all

001 created `"Service role can manage reports"`; 010 dropped it; nothing
replaced it. Inconsistent with `lookups` and `permits` (which kept their
002-added `"service role full access"` policy). Service role bypasses
RLS so this still works in practice — `reports` writes from the webhook
succeed. Recommend either adding the missing policy for symmetry or
dropping the analogous policies on `lookups`/`permits` for symmetry the
other way. Cosmetic.

#### ✅ `summary_feedback` default-deny

Table has RLS enabled and zero policies — that is *intentional*
default-deny. Verified in
`src/app/api/report/[id]/feedback/route.ts:54–60`: writes use
`createServerClient()` which calls `supabase-js` with the service-role
key (`src/lib/supabase/server.ts:11–16`). Service role bypasses RLS, so
the upsert succeeds. No anon/authenticated path exists.

#### ✅ `watchlist` service-role-only

Same pattern. Verified the cron checker at
`src/app/api/cron/watchlist-check/route.ts` uses service-role client.
Users have no direct RLS read path; if the dashboard ever exposes
"my watches," it must go through a Server Action.

### Tables called out by Cameron but not present in current schema

- **`profiles`** — `SPEC.md` §3 introduces a `profiles` table that
  references `auth.users(id)`. This codebase chose a different shape:
  a single `public.users` table that extends `auth.users` directly
  (`migrations/001_initial_schema.sql:8–15`). Not a conflict between
  the codebase and CLAUDE.md, but the spec name will need to be
  reconciled when PR4 introduces the new diligence-era tables.

- **`report_events`** — `SPEC.md` §3 specifies it; not in current
  schema. Scheduled for PR4 (D5). Future audit revision will need to
  add it: it should be RLS-on, default-deny, service-role-write-only
  (events are an internal audit trail).

### Verification still needed (not blocking the audit)

These are checks I want to run before the proposed migration ships,
not gaps in the audit itself:

1. **Confirm `/api/user/onboarding` writes through service role.** It
   updates `user_role`, `deal_volume`, `onboarding_completed` (015).
   Currently the broken `users.UPDATE` policy lets it use the anon
   key; once the policy is dropped, anon-key writes will fail.
   Expected behavior: route already uses `createServerClient()` and
   the change is invisible. Needs to be verified before 017 ships.
2. **Confirm dashboard agent-profile editing (if any) writes
   server-side.** Same reason.
3. **Confirm the onboarding modal write path.** Same reason.

### Proposed `017_rls_hardening.sql` (NOT WRITTEN — pending Cameron)

Per Cameron: "Don't write the migration yet — just the audit document
and the proposed fix list."

#### Required (closes the ❌)

```
-- 017_rls_hardening.sql (proposal — DO NOT APPLY without sign-off)

-- 1. Drop the unrestricted UPDATE policy on users.
--    All profile mutations must go through Server Actions using the
--    service-role client (CLAUDE.md §4: no client-side Supabase writes).
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
```

That single drop closes the privilege-escalation hole. Everything below
is optional polish.

#### Optional (cleans up the ⚠️s)

```sql
-- 2. Remove redundant service_role policies. Service role bypasses
--    RLS regardless; these just add noise.
DROP POLICY IF EXISTS "service role full access" ON public.lookups;
DROP POLICY IF EXISTS "service role full access" ON public.permits;
DROP POLICY IF EXISTS "Service role full access" ON public.watchlist;

-- 3. (Skip — leave reports without a service-role policy. Removing
--    the lookups/permits/watchlist redundancies above brings everyone
--    to the same shape: only owner-SELECT policies on user-data
--    tables; service_role gets through via RLS bypass.)
```

#### Out of scope for 017

- Adding policies for the `profiles` and `report_events` tables that
  PR4 will introduce — those policies live in PR4's migration, in the
  same file as the table per `CLAUDE.md` §4.
- Migrating `/api/user/onboarding` (or any other route) off anon-key
  writes — that's an application-code change, not a migration.

### Acceptance status

- ✅ Every user-data table accounted for (users, lookups, permits,
  reports, summary_feedback, watchlist).
- ✅ Every policy classified.
- ✅ One specific proposed policy change for the ❌.
- ✅ `010_fix_rls_policies.sql` documented end-to-end.
- 🟡 Three application-code verifications outstanding (listed above);
  blocks shipping 017, not blocking the audit itself.

-----

*Last audit pass: 2026-04-29 (PR2.5). Re-run this audit whenever a
migration touches `CREATE/DROP/ALTER POLICY`, `ENABLE ROW LEVEL
SECURITY`, or any user-data table's column set.*
