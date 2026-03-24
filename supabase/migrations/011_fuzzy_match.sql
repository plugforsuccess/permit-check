-- Add used_fuzzy_match flag to lookups table
-- Tracks when permits were found via approximate address matching
ALTER TABLE public.lookups
  ADD COLUMN IF NOT EXISTS used_fuzzy_match BOOLEAN DEFAULT FALSE;
