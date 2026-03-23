-- Watchlist: property monitoring for permit activity alerts
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_id UUID REFERENCES public.lookups(id) ON DELETE SET NULL,
  address_normalized TEXT NOT NULL,
  jurisdiction_id TEXT NOT NULL DEFAULT 'ATLANTA_GA',
  email TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_permit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One watch per address+email — prevents race condition duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_address_email
  ON public.watchlist(address_normalized, email);

-- Cron job: find active watches due for checking
CREATE INDEX IF NOT EXISTS idx_watchlist_active
  ON public.watchlist(active, last_checked_at)
  WHERE active = TRUE;

-- Per-email cap queries
CREATE INDEX IF NOT EXISTS idx_watchlist_email
  ON public.watchlist(email);

-- RLS: service role only — block anon-key access
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.watchlist FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
