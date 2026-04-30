-- 019_per_property_cache_schema.sql
-- PR4 — Per-property cache schema (parallel-tables strategy).
--
-- Creates five new tables that form the canonical schema for the agent path
-- (SPEC §11). Legacy `lookups` / `permits` / `reports` stay alive — this is
-- additive only. The `USE_INNGEST_REPORTS` flag (PR5) is the cutover gate;
-- legacy deprecation lands in a separate PR after the new path runs cleanly
-- in production for 30 days.
--
-- Tables:
--   1. profiles        — extends auth.users with billing/contact fields
--   2. properties      — shared property-level cache (30-day TTL in code)
--   3. permits_v2      — joined to properties, NOT to user searches
--   4. reports_v2      — per-user reports
--   5. report_events   — append-only agent-step audit log
--
-- RLS posture (per CLAUDE.md "Database boundary"):
--   - profiles: own SELECT; service-role INSERT + ALL.
--     **No self-UPDATE policy** — all profile mutations route through
--     Server Actions on the service role, same posture as `users` post-PR2.8
--     F2 (closes the privilege-escalation vector proactively this time).
--   - properties / permits_v2: authenticated SELECT (shared infra; cache hit
--     benefits everyone); service-role ALL.
--   - reports_v2: own SELECT (auth.uid() = user_id); service-role ALL.
--   - report_events: service-role ALL only (audit log; no user-facing read).
--
-- Idempotent shape: every CREATE TABLE uses IF NOT EXISTS, every CREATE INDEX
-- uses IF NOT EXISTS, every CREATE POLICY is preceded by DROP POLICY IF
-- EXISTS, ENABLE ROW LEVEL SECURITY is no-op when already enabled.
--
-- Apply path: direct-to-prod via MCP `apply_migration` per D26 pre-customer
-- expedited path. Pre-flight pg_depend audit + post-apply verification per
-- PR4 acceptance.

BEGIN;

-- ====================================================================
-- 1. profiles
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_service_role_insert" ON public.profiles;
CREATE POLICY "profiles_service_role_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "profiles_service_role_all" ON public.profiles;
CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.profiles IS
  'User profile extending auth.users. Self SELECT only; all writes go through service role. No self-UPDATE policy by design — same posture as public.users post-PR2.8 F2 to prevent privileged-column self-modification.';

-- ====================================================================
-- 2. properties (shared cache, 30-day TTL enforced in code)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_address TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  google_place_id TEXT UNIQUE,
  parcel_id TEXT,
  jurisdiction TEXT NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  year_built INTEGER,
  square_feet INTEGER,
  property_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(normalized_address)
);

CREATE INDEX IF NOT EXISTS idx_properties_parcel ON public.properties(parcel_id);
CREATE INDEX IF NOT EXISTS idx_properties_jurisdiction ON public.properties(jurisdiction);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_authenticated_select" ON public.properties;
CREATE POLICY "properties_authenticated_select"
  ON public.properties FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "properties_service_role_all" ON public.properties;
CREATE POLICY "properties_service_role_all"
  ON public.properties FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.properties IS
  'Shared property-level cache. 30-day TTL enforced in code (lib/agent/), not schema. Authenticated SELECT (cache hit benefits all users); service-role writes only.';

-- ====================================================================
-- 3. permits_v2 (joined to properties)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.permits_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id),
  jurisdiction TEXT NOT NULL,
  permit_number TEXT NOT NULL,
  permit_type TEXT,
  work_description TEXT,
  applicant_name TEXT,
  contractor_name TEXT,
  contractor_license TEXT,
  issued_date DATE,
  finaled_date DATE,
  expiration_date DATE,
  status TEXT,
  valuation NUMERIC(12, 2),
  raw_data JSONB,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(jurisdiction, permit_number)
);

CREATE INDEX IF NOT EXISTS idx_permits_v2_property ON public.permits_v2(property_id);
CREATE INDEX IF NOT EXISTS idx_permits_v2_contractor ON public.permits_v2(contractor_license);

ALTER TABLE public.permits_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permits_v2_authenticated_select" ON public.permits_v2;
CREATE POLICY "permits_v2_authenticated_select"
  ON public.permits_v2 FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "permits_v2_service_role_all" ON public.permits_v2;
CREATE POLICY "permits_v2_service_role_all"
  ON public.permits_v2 FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.permits_v2 IS
  'Permits joined to properties (NOT to user searches). Authenticated SELECT; service-role writes only. UNIQUE(jurisdiction, permit_number) prevents duplicate scrapes across the cache.';

-- ====================================================================
-- 4. reports_v2 (per-user reports)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.reports_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  property_id UUID REFERENCES public.properties(id),
  raw_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'normalizing',
      'gathering',
      'analyzing',
      'generating',
      'pending_review',
      'complete',
      'failed'
    )),
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  llm_cost_usd NUMERIC(6, 4),
  report_json JSONB,
  report_pdf_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_v2_user ON public.reports_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_v2_status ON public.reports_v2(status);

ALTER TABLE public.reports_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_v2_self_select" ON public.reports_v2;
CREATE POLICY "reports_v2_self_select"
  ON public.reports_v2 FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_v2_service_role_all" ON public.reports_v2;
CREATE POLICY "reports_v2_service_role_all"
  ON public.reports_v2 FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.reports_v2 IS
  'Per-user reports. Owner SELECT only (auth.uid() = user_id); service-role writes only. stripe_payment_intent_id UNIQUE for webhook idempotency. report_json holds the structured analysis output (PR9 attestation fields land here, not as discrete columns).';

-- ====================================================================
-- 5. report_events (append-only audit log)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports_v2(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'step_started',
      'step_completed',
      'tool_called',
      'tool_returned',
      'error'
    )),
  step_name TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_events_report ON public.report_events(report_id);

ALTER TABLE public.report_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_events_service_role_all" ON public.report_events;
CREATE POLICY "report_events_service_role_all"
  ON public.report_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.report_events IS
  'Append-only audit log of every agent step. Service-role only; the empty user-facing policy set is intentional. ON DELETE CASCADE from reports_v2 keeps the audit log tied to its parent.';

COMMIT;
