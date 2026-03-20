ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS download_token TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_download_token ON public.reports(download_token);
