# MIGRATION_GUARDRAIL.md — How migrations reach prod

**Owner:** Cameron Wiley. Policy in effect from PR2.7 (2026-04-30) forward. Originating context: DECISIONS.md D25 + `/docs/MIGRATION_LEDGER_AUDIT.md`.

This file documents the operational rules that protect the prod Supabase project (`unjwbyybzfyhiavorcro`) from the failure modes the PR2.6 audit surfaced — namely silent ledger drift, half-applied replays, and undocumented schema changes via the SQL Editor.

-----

## The five rules

These came out of D25 §5 and remain in force:

1. **No `supabase db push` against prod** until D25's reconciliation is verified.
2. **No `supabase migration up` against prod**, same reason.
3. **No new migration files merge to `main`** unless they carry the `migration-approved` label on the PR.
4. **All DDL changes to prod** flow through one of two paths that write the file *and* the ledger row atomically:
   - The Supabase SQL Editor (manual, for one-offs Cameron runs himself).
   - The MCP `apply_migration` tool against the prod project (`bc357075-…`), invoked by an agent or developer with explicit Cameron approval.
5. **Staging environments are exempt.** They rebuild cleanly from `/supabase/migrations` against an empty DB and are the proving ground for any migration before prod. (As of 2026-04-30 there is no staging Supabase project; PR2.7 was applied directly to prod with explicit Cameron approval. When staging is set up, this exemption clause becomes the default safety net.)

-----

## What the CI guardrail does

`.github/workflows/migration-guard.yml` runs on every PR that touches `supabase/migrations/**`. The job fails unless the PR carries the `migration-approved` label.

Cameron is the only person with permission to add the label. The label is added after Cameron has either:
- Verified the migration on staging and confirmed `supabase db diff` is clean (default path), or
- Decided the migration is small/idempotent enough to apply directly to prod (one-off override, used for PR2.7).

The label is automatically *removed* by GitHub when new commits are pushed to the PR (via the standard `dismiss-stale-reviews` pattern, configured in repo settings — Cameron, please confirm this is on or wire it up). That forces re-approval after every change to a migration file.

-----

## What this guardrail does NOT do

- It does not run `supabase db diff` automatically. Diff verification is a manual step Cameron runs before adding the label.
- It does not block merges that *delete* migration files — that's a separate failure mode worth thinking about, but out of scope for PR2.7.
- It does not enforce numbering conventions (sequential 3-digit). The ledger row that lands on prod is whatever the file is named; the convention is enforced by code review.

-----

## State as of 2026-04-30 (post-PR2.7)

- Migration ledger and `/supabase/migrations/` are in sync. Both contain `001`–`016`.
- The two undocumented anomaly UNIQUEs (`permits_lookup_record_unique`, `reports_lookup_id_key`) are now captured in `016_ledger_backfill.sql` with idempotent guards.
- No staging Supabase project exists yet. When one is created, Cameron should rebuild it from `/supabase/migrations/` from scratch and verify it matches prod via `supabase db diff` — that's the test that closes out the post-staging exemption clause in rule #5.
- `supabase db push` is theoretically safe to point at prod now, but the `migration-approved` label gate stays in place permanently — drift like D25 happens once and erodes trust in the entire migration pipeline.

-----

*If a migration ever needs to land on prod outside the workflow above (true emergency), document it in DECISIONS.md the same day with a dated entry, and tag the next prod-bound PR with the discrepancy notes so the next contributor sees the history.*
