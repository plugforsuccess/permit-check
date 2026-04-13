-- Add is_admin flag to users table
-- Admin users bypass payment on all lookups
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast admin checks
CREATE INDEX IF NOT EXISTS idx_users_is_admin
  ON public.users(is_admin)
  WHERE is_admin = TRUE;
