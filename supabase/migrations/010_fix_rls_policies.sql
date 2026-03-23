-- 010_fix_rls_policies.sql
-- Drop overly permissive USING(true) policies from migration 001.
-- These grant the anon key full read/write access to all rows.
-- The service role key bypasses RLS entirely, so these policies are
-- unnecessary AND harmful.

-- Drop the bad policies
DROP POLICY IF EXISTS "Service role can manage lookups" ON public.lookups;
DROP POLICY IF EXISTS "Service role can manage permits" ON public.permits;
DROP POLICY IF EXISTS "Service role can manage reports" ON public.reports;

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
