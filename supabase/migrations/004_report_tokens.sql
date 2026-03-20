ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS download_token TEXT UNIQUE;

-- Backfill existing rows so they're not orphaned
UPDATE public.reports
SET download_token = encode(gen_random_bytes(32), 'hex')
WHERE download_token IS NULL;
