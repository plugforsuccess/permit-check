-- supabase/migrations/003_payments.sql
-- Sprint 3: Payment gate columns and RLS policy for paid permit access.

-- Add paid_at timestamp to lookups
ALTER TABLE public.lookups ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Ensure payment_id column exists (may already exist from 001)
ALTER TABLE public.lookups ADD COLUMN IF NOT EXISTS payment_id TEXT;

-- Permits are only readable (by anon/authenticated) after payment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'permits' AND policyname = 'public read after payment'
  ) THEN
    CREATE POLICY "public read after payment" ON public.permits
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.lookups
          WHERE lookups.id = permits.lookup_id
          AND lookups.paid_at IS NOT NULL
        )
      );
  END IF;
END $$;
