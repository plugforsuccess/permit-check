-- 017_rls_hardening.sql
-- PR2.8 — RLS hardening per /docs/RLS_AUDIT.md §H and PR2.8 scope.
--
-- This migration is fully idempotent. Every CREATE POLICY is preceded by
-- DROP POLICY IF EXISTS; every other DDL is conditional via IF EXISTS or
-- to_regclass guards. Safe to apply against prod, fresh staging, or any
-- partially-migrated state.
--
-- Five items:
--   F1 — Recreate scoped service-role ALL policy on public.reports.
--        Migration 010 dropped the original FOR ALL USING (true) version
--        and did not recreate a scoped replacement. This restores parity
--        with public.lookups and public.permits.
--   F2 — Drop "Users can update own profile" on public.users (option a).
--        Verified safe via three greps: zero client-side anon-key writes
--        to public.users exist. The two server-side upsert sites
--        (webhooks/stripe/route.ts:79, subscription/create/route.ts:50)
--        both use createServerClient() → getSupabaseAdmin(), which uses
--        SUPABASE_SERVICE_ROLE_KEY and bypasses RLS. Eliminates the
--        self-promotion-to-is_admin vector flagged in RLS_AUDIT.md §A.
--   F3 — Document the intentional no-policy state on
--        public.summary_feedback at the database level (COMMENT ON TABLE)
--        and confirm RLS is enabled (idempotent ALTER TABLE).
--   4  — Service-role INSERT policy on public.users. Forward-looks PR8
--        magic-link. Today the policy is functionally redundant (service
--        role bypasses RLS), but explicit-policy + intent-comment is the
--        project standard.
--   5  — Service-role INSERT policy on public.profiles. The table does
--        not yet exist (scheduled for PR4). The block uses to_regclass
--        guards so it is a no-op when profiles is absent and creates the
--        policy when present. PR4's profiles-creation migration MUST
--        include this policy directly so that a fresh staging DB
--        applying 017 → PR4-migration in order ends up with the policy.
--
-- See RLS_AUDIT.md for full grading and rationale per table.

BEGIN;

-- ---------------------------------------------------------------------
-- F1 — Recreate scoped service-role ALL policy on public.reports
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "service role full access" ON public.reports;
CREATE POLICY "service role full access"
  ON public.reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------
-- F2 — Drop self-UPDATE on public.users (option a)
-- ---------------------------------------------------------------------
-- Verified safe: see header comment. The original policy lacked
-- WITH CHECK and would have permitted a logged-in user to self-promote
-- to is_admin via a direct PostgREST PATCH. Service-role-only is now the
-- sole write path for public.users.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- ---------------------------------------------------------------------
-- F3 — summary_feedback intentional no-policy state, documented
-- ---------------------------------------------------------------------
ALTER TABLE public.summary_feedback ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.summary_feedback IS
  'Service-role only; the empty policy set is intentional. RLS is enabled but no policies exist — anon/authenticated keys have zero access. All reads and writes flow through API routes on the service role. See migration 010 and /docs/RLS_AUDIT.md §F.';

-- ---------------------------------------------------------------------
-- Item 4 — Service-role INSERT policy on public.users
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role inserts users" ON public.users;
CREATE POLICY "Service role inserts users"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------
-- Item 5 — Service-role INSERT policy on public.profiles (conditional)
-- ---------------------------------------------------------------------
-- The profiles table is scheduled for PR4. This block runs the policy
-- DDL only if the table exists at apply time. On prod (2026-04-30), the
-- table does not yet exist — this block emits a NOTICE and does nothing.
-- PR4's profiles-creation migration MUST include this policy directly
-- so that a fresh staging DB applying 017 then PR4 migrations in order
-- ends up with the policy in place.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service role inserts profiles" ON public.profiles';
    EXECUTE $POLICY$
      CREATE POLICY "Service role inserts profiles"
        ON public.profiles
        FOR INSERT
        WITH CHECK (auth.role() = 'service_role')
    $POLICY$;
    RAISE NOTICE '017: created "Service role inserts profiles" on existing public.profiles.';
  ELSE
    RAISE NOTICE '017: public.profiles does not yet exist; INSERT policy deferred to PR4 (PR4 must include this policy in its profiles-creation migration).';
  END IF;
END $$;

COMMIT;
