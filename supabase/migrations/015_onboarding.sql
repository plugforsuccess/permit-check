-- Add onboarding fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_role TEXT
    CHECK (user_role IN ('investor', 'wholesaler', 'flipper', 'agent', 'attorney', 'other'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deal_volume TEXT
    CHECK (deal_volume IN ('1_5', '6_15', '16_plus'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for onboarding status
CREATE INDEX IF NOT EXISTS idx_users_onboarding
  ON public.users(onboarding_completed)
  WHERE onboarding_completed = FALSE;
