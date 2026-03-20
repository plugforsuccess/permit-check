-- supabase/migrations/002_permit_records.sql
-- Sprint 2: Ensure permit_records schema supports real Accela scraper data.
-- The base tables were created in 001_initial_schema.sql.
-- This migration adds the `address` column to permits and adjusts indexes.

-- Add address column to permits table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'permits'
      AND column_name = 'address'
  ) THEN
    ALTER TABLE public.permits ADD COLUMN address TEXT;
  END IF;
END $$;

-- Ensure indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_lookups_address_normalized ON public.lookups(address_normalized);
CREATE INDEX IF NOT EXISTS idx_permits_lookup_id ON public.permits(lookup_id);

-- Ensure RLS is enabled
ALTER TABLE public.lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;

-- Service role full access policies (idempotent via IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lookups' AND policyname = 'service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON public.lookups
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'permits' AND policyname = 'service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON public.permits
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
