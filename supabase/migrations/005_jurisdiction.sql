ALTER TABLE public.lookups
  ADD COLUMN IF NOT EXISTS jurisdiction_id TEXT NOT NULL DEFAULT 'ATLANTA_GA';

CREATE INDEX IF NOT EXISTS idx_lookups_jurisdiction
  ON public.lookups(jurisdiction_id);
