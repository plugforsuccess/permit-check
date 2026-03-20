
-- PermitCheck MVP Database Schema
-- City of Atlanta Permit Verification Platform

-- gen_random_uuid() is built into Postgres 13+ (no extension needed)

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'buyer', 'agent', 'investor')),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookups table
CREATE TABLE IF NOT EXISTS public.lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_raw TEXT NOT NULL,
  address_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payment_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  permit_count INTEGER,
  report_type TEXT NOT NULL DEFAULT 'standard' CHECK (report_type IN ('standard', 'attorney'))
);

-- Permits table
CREATE TABLE IF NOT EXISTS public.permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_id UUID NOT NULL REFERENCES public.lookups(id) ON DELETE CASCADE,
  record_number TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  filed_date DATE,
  issued_date DATE,
  description TEXT,
  contractor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_id UUID NOT NULL REFERENCES public.lookups(id) ON DELETE CASCADE,
  pdf_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lookups_user_id ON public.lookups(user_id);
CREATE INDEX idx_lookups_address_normalized ON public.lookups(address_normalized);
CREATE INDEX idx_lookups_payment_status ON public.lookups(payment_status);
CREATE INDEX idx_permits_lookup_id ON public.permits(lookup_id);
CREATE INDEX idx_reports_lookup_id ON public.reports(lookup_id);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Users can view their own lookups
CREATE POLICY "Users can view own lookups"
  ON public.lookups FOR SELECT
  USING (auth.uid() = user_id);

-- Allow anonymous lookups (inserted by service role)
CREATE POLICY "Service role can manage lookups"
  ON public.lookups FOR ALL
  USING (true)
  WITH CHECK (true);

-- Permits readable if lookup is accessible
CREATE POLICY "Permits follow lookup access"
  ON public.permits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lookups
      WHERE lookups.id = permits.lookup_id
      AND (lookups.user_id = auth.uid() OR lookups.payment_status = 'paid')
    )
  );

-- Service role can manage permits
CREATE POLICY "Service role can manage permits"
  ON public.permits FOR ALL
  USING (true)
  WITH CHECK (true);

-- Reports follow lookup access
CREATE POLICY "Reports follow lookup access"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lookups
      WHERE lookups.id = reports.lookup_id
      AND (lookups.user_id = auth.uid() OR lookups.payment_status = 'paid')
    )
  );

-- Service role can manage reports
CREATE POLICY "Service role can manage reports"
  ON public.reports FOR ALL
  USING (true)
  WITH CHECK (true);
