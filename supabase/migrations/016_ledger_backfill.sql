-- 016_ledger_backfill.sql
-- PR2.7 — Migration ledger backfill (Option A)
--
-- Context: supabase_migrations.schema_migrations on prod records only
-- 001/002/003, but the DDL of 004–015 is fully applied (each migration was
-- run via the SQL Editor or dashboard, which does not write to the ledger).
-- Two extra objects (UNIQUE constraints on permits and reports) also exist
-- on prod with no migration source in the repo. Until the ledger reflects
-- reality, `supabase db push` is unsafe to point at prod — it would
-- attempt to replay 004–015, and migrations 009 and 010 are not safe to
-- replay as written (CREATE POLICY without IF NOT EXISTS guards). See
-- /docs/MIGRATION_LEDGER_AUDIT.md and DECISIONS.md D25.
--
-- This migration does two things:
--
-- 1. Inserts ledger rows for 004–015 so the CLI knows they are applied.
--    The `statements` column is left as a marker comment rather than the
--    full original SQL — the original files remain the source of truth at
--    /supabase/migrations/. A future repair via `supabase migration repair`
--    can populate exact statements if a CLI feature ever requires them;
--    for the current goal (prevent CLI replay), version+name presence is
--    sufficient.
--
-- 2. Captures the two undocumented anomaly objects (permits_lookup_record_unique,
--    reports_lookup_id_key) as authoritative DDL with idempotent guards.
--    Both are intentional — verified against application code:
--      - reports_lookup_id_key is required by upserts in
--        src/app/api/lookup/[id]/analyze-listing/route.ts,
--        src/app/api/lookup/[id]/regenerate/route.ts,
--        and src/app/api/webhooks/stripe/route.ts (all use
--        onConflict: "lookup_id").
--      - permits_lookup_record_unique prevents duplicate-permit insertion
--        on scraper retries.
--    On prod, the DO blocks below are no-ops (the constraints already exist).
--    On a fresh staging DB built from /supabase/migrations/, this migration
--    creates them — bringing staging into parity with prod.
--
-- Apply via Supabase SQL Editor or MCP `apply_migration`. Do NOT apply via
-- `supabase db push` until D25's CI guardrail is lifted.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Backfill ledger rows for 004–015
-- ---------------------------------------------------------------------
-- Each row is inserted only if it does not already exist, so this
-- migration is safe to run against an environment where the ledger is
-- already in sync (no-op).

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('004', 'report_tokens',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/004_report_tokens.sql']),
  ('005', 'jurisdiction',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/005_jurisdiction.sql']),
  ('006', 'matter_reference',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/006_matter_reference.sql']),
  ('007', 'ai_summary',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/007_ai_summary.sql']),
  ('008', 'agent_subscription',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/008_agent_subscription.sql']),
  ('009', 'watchlist',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/009_watchlist.sql']),
  ('010', 'fix_rls_policies',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/010_fix_rls_policies.sql']),
  ('011', 'fuzzy_match',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/011_fuzzy_match.sql']),
  ('012', 'initiator_ip',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/012_initiator_ip.sql']),
  ('013', 'listing_description',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/013_listing_description.sql']),
  ('014', 'admin_flag',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/014_admin_flag.sql']),
  ('015', 'onboarding',
    ARRAY['-- Backfilled by 016_ledger_backfill.sql; see /supabase/migrations/015_onboarding.sql'])
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Capture undocumented anomaly objects authoritatively
-- ---------------------------------------------------------------------

-- 2a. permits_lookup_record_unique UNIQUE(lookup_id, record_number)
-- Required to prevent duplicate-permit insertion on scraper retries.
-- Verified intentional: src/app/api/lookup/[id]/scrape/route.ts inserts
-- permits in batch and relies on this constraint to enforce idempotence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'permits_lookup_record_unique'
      AND conrelid = 'public.permits'::regclass
  ) THEN
    ALTER TABLE public.permits
      ADD CONSTRAINT permits_lookup_record_unique
      UNIQUE (lookup_id, record_number);
  END IF;
END $$;

-- 2b. reports_lookup_id_key UNIQUE(lookup_id)
-- Required by upsert paths in:
--   - src/app/api/lookup/[id]/analyze-listing/route.ts (onConflict: "lookup_id")
--   - src/app/api/lookup/[id]/regenerate/route.ts     (onConflict: "lookup_id")
--   - src/app/api/webhooks/stripe/route.ts            (onConflict: "lookup_id")
-- The constraint name `reports_lookup_id_key` is the auto-generated form
-- Postgres uses for an unnamed UNIQUE; preserved here for parity with prod.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_lookup_id_key'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_lookup_id_key UNIQUE (lookup_id);
  END IF;
END $$;

COMMIT;
