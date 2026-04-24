-- Agent Diligence Reports
--
-- Distinct from `reports` (PDF delivery metadata). An `agent_report` is a full
-- structured diligence run: plan, tool outputs, analysis, final JSON report,
-- plus timing and cost. `report_events` is the append-only audit trail.

CREATE TABLE IF NOT EXISTS public.agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lookup_id UUID REFERENCES public.lookups(id) ON DELETE SET NULL,
  raw_address TEXT NOT NULL,
  normalized_address TEXT,
  jurisdiction TEXT,
  intent TEXT NOT NULL DEFAULT 'flip'
    CHECK (intent IN ('flip', 'rental', 'primary_residence', 'portfolio_hold')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'normalizing', 'gathering', 'analyzing', 'generating', 'complete', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds NUMERIC(8, 2),
  llm_cost_usd NUMERIC(8, 4),
  plan_json JSONB,
  tool_outputs_json JSONB,
  report_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_user ON public.agent_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_status ON public.agent_reports(status);
CREATE INDEX IF NOT EXISTS idx_agent_reports_created ON public.agent_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS public.report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.agent_reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'step_started', 'step_completed', 'step_failed',
      'tool_called', 'tool_returned', 'tool_failed',
      'llm_called', 'llm_returned',
      'error', 'info'
    )),
  step_name TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_events_report ON public.report_events(report_id, created_at);

ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own agent reports"
  ON public.agent_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages agent reports"
  ON public.agent_reports FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users read events for own agent reports"
  ON public.report_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_reports
      WHERE agent_reports.id = report_events.report_id
        AND agent_reports.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages report events"
  ON public.report_events FOR ALL
  USING (true) WITH CHECK (true);
