# MIGRATION_LEDGER_AUDIT.md — supabase_migrations.schema_migrations drift

**Status:** PR2.6 deliverable (audit). Backfill executed in PR2.7 on 2026-04-30 via Option A applied directly to prod with Cameron approval (idempotent migration; staging-first step skipped). Post-execution: `supabase_migrations.schema_migrations` contains rows `001`–`016` contiguous; both anomaly UNIQUEs are now captured authoritatively by `016_ledger_backfill.sql`. PR4 is **no longer blocked** by ledger drift; it is still subject to the `migration-approved` label gate documented in `/docs/MIGRATION_GUARDRAIL.md`.

**TL;DR:** The Supabase project `unjwbyybzfyhiavorcro` has the *schema* of all 15 local migrations applied, but the *ledger* (`supabase_migrations.schema_migrations`) records only `001/002/003`. Twelve migrations were applied to prod through a non-CLI path (SQL Editor, dashboard, or direct `psql`) and the ledger never learned about them. Any future `supabase db push` or `supabase migration up` against prod will attempt to replay `004`–`015` against a database that already has the changes, with mixed (and partially destructive) results. Until reconciled, the CLI is unsafe to point at prod.

This is the kind of bug that does not surface until the day it bites — and the day it bites is the day a migration without `IF NOT EXISTS` guards re-runs and either errors halfway through (leaving the schema mid-state) or, worse, succeeds at the parts that *aren't* idempotent.

-----

## 1. Forensic snapshot (live DB, 2026-04-30)

Source: MCP server `bc357075-ebc9-411d-b3af-88bc1abc5e4e` against project `unjwbyybzfyhiavorcro`.

### 1.1 Ledger contents
```
SELECT version, name, statements IS NOT NULL AS has_statements
FROM supabase_migrations.schema_migrations ORDER BY version;
```
| version | name | has_statements |
|---|---|---|
| 001 | initial_schema | true |
| 002 | permit_records | true |
| 003 | payments | true |

### 1.2 Local repo contents
`/supabase/migrations/`:
```
001_initial_schema.sql
002_permit_records.sql
003_payments.sql
004_report_tokens.sql
005_jurisdiction.sql
006_matter_reference.sql
007_ai_summary.sql
008_agent_subscription.sql
009_watchlist.sql
010_fix_rls_policies.sql
011_fuzzy_match.sql
012_initiator_ip.sql
013_listing_description.sql
014_admin_flag.sql
015_onboarding.sql
```
**Drift: 12 migrations (`004`–`015`) exist in the repo but not in the ledger.**

### 1.3 Live schema confirms 004–015 *did* run
| Migration | Evidence on live DB |
|---|---|
| `004_report_tokens` | `reports.download_token` column present, `reports_download_token_key` UNIQUE index present |
| `005_jurisdiction` | `lookups.jurisdiction_id` column present, `idx_lookups_jurisdiction` index present |
| `006_matter_reference` | `reports.matter_reference` column present |
| `007_ai_summary` | `reports.ai_summary`, `reports.risk_level` columns present |
| `008_agent_subscription` | `users.agent_name`, `users.brokerage`, `users.stripe_subscription_id`, `users.subscription_status` columns present, `idx_users_subscription_status` index present |
| `009_watchlist` | `public.watchlist` table present, `Service role full access` policy present, all three indexes present |
| `010_fix_rls_policies` | `public.summary_feedback` table present (RLS on, no policies), the three `FOR ALL USING (true)` policies are *gone*, the new `Permits follow lookup access` and `Reports follow lookup access` policies present |
| `011_fuzzy_match` | `lookups.used_fuzzy_match` column present |
| `012_initiator_ip` | `lookups.initiator_ip` column present |
| `013_listing_description` | `lookups.listing_description` column present |
| `014_admin_flag` | `users.is_admin` column present, `idx_users_is_admin` index present |
| `015_onboarding` | `users.user_role`, `users.deal_volume`, `users.onboarding_completed` columns present, `idx_users_onboarding` index present |

Conclusion: every DDL effect of `004`–`015` is on prod. The drift is purely in the ledger.

### 1.4 Anomalies — indexes/constraints with no migration source
Two objects appear in prod that I cannot trace to any migration file in the repo:

| Object | Table | Likely origin |
|---|---|---|
| `permits_lookup_record_unique` | `permits` | UNIQUE constraint on `(lookup_id, record_number)`. No `ALTER TABLE permits ADD CONSTRAINT` for this exists in `001`–`015`. Almost certainly an ad-hoc fix applied via SQL Editor when the scraper started inserting duplicates. |
| `reports_lookup_id_key` | `reports` | UNIQUE on `(lookup_id)`. Same shape — added directly. |

These are functionally fine and probably correct, but they are **completely undocumented in the repo**. They will not exist in a freshly-spun staging DB built from `/supabase/migrations`, which means CI eval runs and any new env will diverge from prod from the moment they boot.

### 1.5 Data on prod
| table | rows |
|---|---|
| `users` | 0 |
| `lookups` | 3 |
| `permits` | 25 |
| `reports` | 2 |
| `summary_feedback` | 0 |
| `watchlist` | 0 |

Prod is sparsely populated — Cameron's own test data, presumably. Recovery from a destructive replay is *theoretically* plausible, but treat it as "do not destroy this — there are real PDFs in Storage tied to those report rows."

-----

## 2. Reconstruction — when did the drift start?

Hypothesis (cannot be proven from MCP alone, but strongly indicated):
1. `001/002/003` were applied via the Supabase CLI early in the project, when the workflow was still "edit migration → push." That populated the ledger correctly.
2. At some point — likely around `004` (Sprint after payment work) — the workflow shifted to applying SQL via the Supabase Studio SQL Editor for speed. The Editor does **not** write to `supabase_migrations.schema_migrations`. From `004` onward, every migration was applied as a one-off and the ledger never learned about it.
3. The two undocumented index/constraint additions in §1.4 were almost certainly applied the same way, without being captured back into a migration file.

To confirm 100%, we'd need git blame on the migration files vs. timestamps on `pg_class.relfilenode` creation dates, which is out of scope for this audit. The mechanism is clear enough to plan around.

-----

## 3. Replay safety per migration

If we ever pointed `supabase db push` at prod today, the CLI would attempt to replay `004`–`015` in order. Per-migration assessment:

| Migration | Safe to replay against prod? | Why / why not |
|---|---|---|
| `004_report_tokens` | ⚠️ Partial | `ADD COLUMN IF NOT EXISTS` — safe. But the `UPDATE ... SET download_token = encode(gen_random_bytes(32), 'hex') WHERE download_token IS NULL` will **rotate tokens for any row that somehow has NULL** — none today, but the migration is non-idempotent in a way that could surprise us. Functionally the existing 2 reports already have tokens, so this UPDATE would be a no-op. Verify before replay. |
| `005_jurisdiction` | ✅ Safe | All `IF NOT EXISTS`. |
| `006_matter_reference` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`. |
| `007_ai_summary` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`. |
| `008_agent_subscription` | ✅ Safe | All `IF NOT EXISTS`. |
| `009_watchlist` | ✅ Safe | `CREATE TABLE IF NOT EXISTS`, `CREATE * INDEX IF NOT EXISTS`. The `CREATE POLICY` is **not** guarded by `IF NOT EXISTS` — but `010` doesn't drop it, so it's still there, and a re-`CREATE POLICY` of the same name would error. ⚠️ **Will fail on replay.** |
| `010_fix_rls_policies` | ⚠️ Mostly safe but ❌ for `summary_feedback` | The `DROP POLICY IF EXISTS` blocks are safe. `CREATE POLICY` for `Permits follow lookup access` and `Reports follow lookup access` would error because those policies already exist (no `IF NOT EXISTS` on `CREATE POLICY`, and `010` only drops them inside its own block). The `CREATE TABLE summary_feedback IF NOT EXISTS` is safe. The `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is idempotent. **Net: replay errors on the two `CREATE POLICY` statements, leaving 010 partially applied.** |
| `011_fuzzy_match` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`. |
| `012_initiator_ip` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`. |
| `013_listing_description` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`. |
| `014_admin_flag` | ✅ Safe | `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. |
| `015_onboarding` | ✅ Safe | All `IF NOT EXISTS`. |

**Summary:** `009` and `010` are not safe to replay as written. The rest are. This is the second reason a backfill is non-negotiable before any CLI work hits prod — even if we accept the small risk on the others, `009`/`010` will half-apply and leave the DB in an inconsistent state.

-----

## 4. Backfill plan

Two options. Cameron picks one. Both are reversible — neither destroys data — but they have different ergonomics.

### Option A — Insert ledger rows for the already-applied migrations (recommended)

For each of `004`–`015`:
1. Read the file from `/supabase/migrations/`.
2. Insert a row into `supabase_migrations.schema_migrations`:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('004', 'report_tokens', ARRAY[<file contents split by ;>]);
   ```
   The `statements` column is a `text[]` of the SQL the CLI would have stored. We can compute it the same way the CLI does — split on `;` boundaries, trim, drop empties.
3. The two undocumented objects from §1.4 (`permits_lookup_record_unique`, `reports_lookup_id_key`) get a new sequentially-numbered "anomaly capture" migration that uses `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS` (PG14+) or a `DO $$ ... pg_constraint ... $$` guard, so a fresh staging DB matches prod. That migration becomes the *first* row of the ledger that the CLI applies on a fresh env. It's a **no-op against prod** because the constraints already exist.

**Pros:** preserves migration history, keeps `015` numbering, lowest risk to prod, lets CLI workflow resume cleanly.
**Cons:** requires careful row construction; one bad `statements` value can cause confusion later when comparing hashes.
**Verification step:** after backfill, run `supabase migration list` (against prod, read-only) and confirm `001`–`015` are reported as applied. Then run a `supabase db diff` and confirm zero DDL drift between repo and prod (modulo the anomaly migration).

### Option B — Squash `001`–`015` into a single `001_initial_squash.sql` baseline

1. Use `supabase db dump --schema-only` against prod to capture the exact current schema.
2. Replace `/supabase/migrations/*` with a single `001_baseline.sql` containing that dump.
3. Reset the ledger to record only the baseline.

**Pros:** simplest end state. No history mismatch possible.
**Cons:** loses migration history (we have it in git, but `git log` is not the migration ledger). Forces a coordinated reset on every developer machine. Higher risk of subtle behavioral drift between dump output and the original CREATE statements (e.g., default value formatting, constraint ordering, generated column expressions).
**Verification:** spin a fresh staging Supabase project from the squashed baseline, dump *its* schema, diff against prod's dump. Diff must be empty.

**Recommendation: Option A.** The 15 migrations are small and well-formed; preserving history is worth the careful row construction. Option B is the right call only if Cameron wants a clean slate before the new schema (PR4) lands, which is also a defensible position.

### What option A's backfill does not include

- It does **not** apply any new DDL to prod.
- It does **not** modify any user-data table.
- It does **not** rotate any tokens, secrets, or RLS policies.
- It only inserts rows into `supabase_migrations.schema_migrations`.

This is the smallest possible reconciliation step.

-----

## 5. Operational guardrail (proposed for D25 in DECISIONS.md)

Until the ledger is reconciled (Option A applied + verification step passed, or Option B baseline cut + verification step passed):

1. **No `supabase db push` against prod.** Period. The CLI is unsafe to point at this project until the ledger reflects reality.
2. **No `supabase migration up` against prod.** Same reason.
3. **No new migration files merged to `main`** beyond the in-flight PRs (PR1.6, PR2, PR2.5, PR2.6, etc.) until §4's chosen option is executed. New migrations are fine to *write* in PR branches; they may not be *applied* to prod.
4. **All DDL changes to prod continue to go through the SQL Editor or via the MCP `apply_migration` tool**, both of which write the migration file *and* the ledger row in one operation, exactly the way 001–003 were originally applied.
5. **Staging environments are exempt** — they can be rebuilt from `/supabase/migrations` from scratch, which works fine against an empty DB. Use staging to verify §4 before touching prod.

These are the rules until §4's verification step is green. After that, the CLI is safe to use again.

-----

## 6. Why this blocks PR4

PR4 lands the new `properties` / `permits_v2` / `reports_v2` / `report_events` schema. It *must* be a tracked migration in the ledger — otherwise the moment we add migration #16 in the local repo, we've added a third diverging path (file exists, schema applied via Editor, ledger has no idea) and the drift compounds. PR4 is also the first migration that creates *new* tables since `010`'s `summary_feedback`, so a half-applied-on-replay scenario is not just academic — it would leave half a feature schema on prod.

PR4 is therefore blocked on §4 + §5 being executed successfully, in that order.

-----

## 7. Out of scope for this audit

- Writing the backfill SQL itself (deferred until Cameron picks A or B).
- Authoring the "anomaly capture" migration in §4 option A (deferred to that PR).
- Deciding whether `017_rls_hardening.sql` lands before or after the ledger reconciliation. (Recommendation: after — see RLS_AUDIT.md §H "Blockers before 017 ships.")

-----

*Last updated: 2026-04-30. Author: PR2.6 migration ledger audit. Live DB verified against Supabase project `unjwbyybzfyhiavorcro` via MCP `bc357075-…`.*
