-- 010_fix_rls_policies.sql
-- Drop overly permissive USING(true) policies from migration 001.
-- These grant the anon key full read/write access to all rows.
-- The service role key bypasses RLS entirely, so these policies are
-- unnecessary AND harmful.

-- Drop the bad USING(true) policies from migration 001
DROP POLICY IF EXISTS "Service role can manage lookups" ON public.lookups;
DROP POLICY IF EXISTS "Service role can manage permits" ON public.permits;
DROP POLICY IF EXISTS "Service role can manage reports" ON public.reports;

-- Drop the stale "public read after payment" policy from migration 003.
-- It lets any anon/authenticated user read permits for ANY paid lookup
-- via the Supabase REST API. Payment gating belongs in the API layer.
DROP POLICY IF EXISTS "public read after payment" ON public.permits;

-- Fix permits access: only the lookup owner can read permits (via RLS),
-- or the service role (which bypasses RLS). The payment gate is enforced
-- in the API layer, not RLS, because anonymous lookups have NULL user_id.
DROP POLICY IF EXISTS "Permits follow lookup access" ON public.permits;
CREATE POLICY "Permits follow lookup access"
  ON public.permits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lookups
      WHERE lookups.id = permits.lookup_id
      AND lookups.user_id = auth.uid()
    )
  );

-- Create summary_feedback table (used by /api/report/[id]/feedback)
CREATE TABLE IF NOT EXISTS public.summary_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_id UUID NOT NULL REFERENCES public.lookups(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT summary_feedback_lookup_unique UNIQUE (lookup_id)
);

ALTER TABLE public.summary_feedback ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — only service role (which bypasses RLS)

-- Same fix for reports
DROP POLICY IF EXISTS "Reports follow lookup access" ON public.reports;
CREATE POLICY "Reports follow lookup access"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lookups
      WHERE lookups.id = reports.lookup_id
      AND lookups.user_id = auth.uid()
    )
  );
