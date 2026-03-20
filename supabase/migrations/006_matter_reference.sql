ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS matter_reference TEXT;
