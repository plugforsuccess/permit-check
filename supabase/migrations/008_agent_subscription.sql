-- Add agent profile and subscription tracking to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS brokerage TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing', 'unpaid'))
    DEFAULT NULL;

-- Index for subscription status lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription_status
  ON public.users(subscription_status);
