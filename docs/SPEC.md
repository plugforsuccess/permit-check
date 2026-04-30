# SPEC.md — PermitCheck Diligence Agent MVP

> Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth + Storage) · Claude Sonnet 4.5 (orchestration) · Claude Opus 4.7 (report generation) · Vercel Pro · Inngest · Playwright · Stripe · Resend · npm. Target: 90-second end-to-end report generation for any Atlanta-metro residential property.

Prepared by Cameron Wiley, Founder & CEO. This document is the source of truth for *what* the MVP does. `/CLAUDE.md` is the source of truth for *how* the code is written. `/docs/DECISIONS.md` records resolutions to design contradictions surfaced during the build.

The first half of this document is the product summary — read end-to-end every session. The second half (§9 onward) is the implementation reference — pull in only when working on the specific area covered.

-----

## PART I — PRODUCT SUMMARY

## 1. What we’re building

A web application where a real estate investor enters a property address, pays $29, and receives a due diligence report within 90 seconds. The report analyzes permit history, detects unpermitted work, surfaces open code violations and inspection failures, scores contractor quality, and produces a list of questions the investor should ask the seller.

The product category is workflow automation powered by proprietary permit data — not a data dashboard. The agent IS the product. A pretty UI on top of raw permit data would not justify $29. An AI that produces underwriting-grade analysis on any Atlanta property in 90 seconds justifies $29 easily.

This is PermitCheck’s first revenue product. The thesis: AI agents layered over proprietary permit data are more valuable than the data alone. The next 24 months of company strategy depends on this MVP working well — we will show it to customers, investors, and the incoming Co-Founder & President.

-----

## 2. Constraints

- **Jurisdictions:** Atlanta + Gwinnett (already implemented). Extend to DeKalb, Fulton (unincorporated), and Cobb if time allows.
- **Latency:** 90-second target. Longer than 2 minutes is unacceptable.
- **Cost:** LLM variable cost <$2 per report. $29 unit price requires 85%+ gross margin.
- **Team:** Single-developer build. No infrastructure we can’t debug alone.
- **Timeline:** 6 weeks (42 calendar days). Scope ruthlessly.

### Out of scope for MVP

- Multi-state coverage (Atlanta-metro only)
- Mobile app (web-responsive only)
- Agency/B2B dashboard (consumer flow first)
- AMS integrations (post-MVP)
- Policy capture and insurance cross-sell (v1.1)
- White-label reports
- $99/mo subscription (v1.1; ship $29 one-time only for MVP)
- $199 attorney report and $29/mo buyer plan (delete from `config.pricing`; never carried forward dormant)

-----

## 3. Architecture overview

```
User submits address
        ↓
[Next.js: /api/reports/create]
        ↓
Auth (Supabase magic link) + Payment (Stripe Checkout)
        ↓
Inngest event → background agent runs
        ↓
[Agent Orchestrator]
  ├── 1. Address normalization (Google Places)
  ├── 2. Parcel resolution (county assessor)
  ├── 3. Planning (Sonnet 4.5)
  ├── 4. Parallel tool calls (data gathering)
  ├── 5. Analysis (Sonnet 4.5)
  ├── 6. Depth decision (max 2 extra calls)
  ├── 7. Report generation (Opus 4.7)
  └── 8. Persist + deliver (PDF + email)
        ↓
Supabase Realtime → status page
        ↓
Report renders in app + PDF emailed
```

Step-by-step prompts, tool definitions, and analysis guidelines are in §10.

-----

## 4. Database schema

Full DDL in §11. Key tables:

- **`profiles`** — extends Supabase Auth users with billing/contact fields
- **`properties`** — shared, property-level cache (one row per parcel, 30-day TTL)
- **`permits`** — shared, joined to `properties` (not to user searches)
- **`reports`** — per-user report records, includes `stripe_payment_intent_id` (UNIQUE), `report_json`, `llm_cost_usd`, `duration_seconds`, `status`
- **`report_events`** — append-only audit log of every agent step

Two non-obvious rules:

**`properties` and `permits` are shared infrastructure.** Cached at the property level, not the user level. The 2nd, 3rd, 4th investors looking at the same address share the same cache row. Don’t add `user_id` to these tables — the unit economics depend on this.

**Only the service role writes to `properties`, `permits`, `reports`, and `report_events`.** Clients read their own `reports` rows via RLS. Everything else goes through Server Actions or Inngest.

RLS is on for every table holding user data, default deny, policies in the same migration as the table.

**Migration strategy.** Parallel tables. The legacy `lookups` / `permits` (with `lookup_id`) stay alive with `USE_INNGEST_REPORTS=false` as the gate. New code writes to `properties` / `permits_v2` (with `property_id`) / `reports_v2` / `report_events`. After 30 days of clean production runs on the new path, deprecate legacy tables in a separate PR. Never edit migrations that have already run — drop columns and tables in new migrations.

-----

## 5. User experience

### Happy path

1. Land on permitcheck.org. Hero: “Know what you’re buying. AI-powered permit due diligence in 90 seconds.”
1. Type address. Google Places autocomplete limits to Atlanta metro.
1. Click “Get Report — $29.”
1. Magic-link auth if not signed in.
1. Stripe Checkout. Pay $29.
1. Redirect to `/reports/[id]` status page.
1. Live progress via Supabase Realtime: “Pulling permits → Analyzing → Writing report.”
1. At ~90s: report renders in-page. Download PDF, share link.
1. Email arrives with PDF attached.

**First 100 reports go to `pending_review`** — Cameron reviews before auto-delivery. Status page copy reflects this: “Your report is being finalized — you’ll receive it within an hour.” Auto-deliver is gated by `AUTO_DELIVER_REPORTS=true`, removed once 100 reports show consistent quality. Applies to the new Inngest path only; legacy `$9.99` path is unchanged until deleted.

### Error paths

- **Payment fails:** standard Stripe retry flow.
- **Agent fails mid-run:** auto-refund (programmatic Stripe API call from the Inngest failure handler), Slack/email alert to Cameron, error stored in `reports.error_message`.
- **Data insufficient:** report delivers with a “limited data” caveat; user offered 50% refund.
- **Property outside Atlanta metro:** rejected before payment, waitlist signup offered.

Status page copy with timing breakdown: §10 Step 8.

-----

## 6. Evaluation

`/evals/golden-set/` holds JSON fixtures with ground-truth reports. `npm run eval` runs the harness; CI runs it on every PR touching `/lib/agent/**` or `/lib/scraping/**`.

**Thresholds (merge gate):**

- Critical red flag recall: ≥90%
- Hallucinations (uncited claims): 0
- p95 duration: ≤120s
- Cost per report: ≤$2.00
- Completeness: 100% of report sections populated

**Hallucination detection is structural, not semantic.** Red flags are emitted with required `evidence_refs: string[]`; every entry must resolve to an ID present in the gathered data. Set membership, not NLP.

**Greenwich St SW quadruplex is golden set #1.** Cameron has ground-truth knowledge from active litigation. If the agent’s output contradicts what Cameron knows to be true, the agent is not ready to ship and no other eval result matters. **Cameron authors this fixture himself** — PR7 is blocked on it.

Eval harness implementation in §13.

-----

## 7. Acceptance criteria

The MVP is shipped when ALL of the following are true.

### Functional

- User can submit any Atlanta-metro residential address and receive a report in <120s p95
- Stripe $29 one-time flow works end-to-end
- PDF report delivers via email within 2 minutes of completion
- Status page updates in real-time via Supabase Realtime
- Failed reports auto-refund programmatically
- Admin dashboard shows all reports with status, duration, cost

### Quality

- Golden set: ≥90% recall on critical red flags, 0 hallucinations
- Greenwich St SW property correctly identifies known issues from litigation
- First 10 production reports personally reviewed and approved by Cameron
- No report contains a claim without cited evidence

### Performance

- p50 end-to-end: <80s
- p95 end-to-end: <120s
- LLM cost per report: <$2.00
- All-in unit economics: <$5.00 per report (incl. infra + data APIs)

### Reliability

- 99%+ report completion rate (failures auto-refund)
- Scraping circuit breakers prevent agent hang when portals are down
- Sentry receiving errors; Axiom logging every agent step

### Compliance

- Privacy policy at `/privacy`, Terms at `/terms`
- ToS includes disclaimers about data accuracy and explicitly states no legal advice
- Supabase RLS enforced on all user-data tables (verified by `017_rls_hardening.sql` audit)
- No PII in LLM logs (addresses redacted to ZIP+street-name at info level, full address only at debug behind `LOG_FULL_ADDRESS=true`)
- Stripe PCI handled entirely by Checkout

-----

## 8. Open questions for Cameron

Resolved:

- ✅ Existing Atlanta scraper: in current `permit-check` Next.js codebase
- ✅ Domain: `permitcheck.org` — replace existing pages
- ✅ Supabase: existing project, parallel-table migration strategy
- ✅ Pricing: $29 one-time only for MVP
- ✅ Scope: Atlanta + Gwinnett (already done) + DeKalb if time permits
- ✅ Branding: existing PermitCheck assets
- ✅ Auth: switch to magic-link before launch as PR8 (passwords are v0 reality)
- ✅ Inngest tier: free through soft launch, Pro before public launch

Still open:

- On-call for first 30 days post-launch: Cameron alone, or shared rotation once Alan joins?

-----

## PART II — IMPLEMENTATION REFERENCE

The remainder of this document is the build reference. Pull in §9–§14 when working on the specific area each covers. None of this should be loaded by Claude Code on every turn — only when the task is in scope.

-----

## 9. Stack decisions & justifications

**Next.js 16 (App Router).** The existing `permit-check` codebase. App Router for all new routes. Server Components for static content, Server Actions for new mutations, Client Components only where interactivity is required (status polling, address autocomplete, map display).

**Supabase (Postgres + Auth + Storage).** Single source of truth for data, auth, and file storage. RLS from day one. Magic-link auth (no passwords) for friction reduction — PR8 migrates from current password auth. Storage for PDF reports.

**Claude Sonnet 4.5 for orchestration, Claude Opus 4.7 for report generation.** Sonnet handles planning, tool calls, and analysis — fast and cheap enough to iterate. Opus handles final report composition; report quality is what customers pay for, so the cost difference is justified. Pin model IDs in `lib/env.ts` as `ANTHROPIC_MODEL_ORCHESTRATOR` and `ANTHROPIC_MODEL_REPORTER`. Anthropic SDK native tool use only — no LangChain, no LangGraph, no MCP.

**Inngest for background jobs.** Reports take 60-90s; Vercel API routes time out at 60s on Pro and we need reliability. Inngest gives free-tier coverage for MVP, built-in retries, visual debugging. Free tier through soft launch. Upgrade to Pro before public launch — wire PR3 against free-tier limits (24h retention, lower concurrency) but plan for the upgrade.

**Stripe Checkout (hosted).** Don’t build custom payment UI. Stripe Checkout handles PCI compliance, card validation, Apple Pay. Webhook to Supabase confirms payment before enqueueing the report job. $29 one-time only for MVP — the $99/mo subscription is v1.1.

**Vercel Pro hosting.** Standard for Next.js. Do not use Edge Functions for the agent — they have limits that bite. Run the agent in Inngest with Node runtime.

**Playwright for scraping.** The `permit-check` codebase already uses Playwright via `playwright-core` against Accela. Don’t migrate to Puppeteer.

**`@sparticuz/chromium-min` for serverless PDF.** Already a dep. Budget extra time for PDF reliability. Browserless or Documint are acceptable hosted fallbacks if reliability becomes an issue.

**Google Places API.** Same GCP project as the existing maps key. Enable the “Places API (New)” SKU. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the autocomplete-on-frontend key (must be domain-restricted in GCP console). `GOOGLE_MAPS_SERVER_KEY` is the server-side key for Text Search calls in the agent’s normalize step.

-----

## 10. The eight steps in detail

### Step 1 — Address normalization (deterministic, no LLM)

Input: raw address string. Output: normalized address, lat/long, Google Place ID. Google Places API (New) Text Search endpoint. Cache results in Postgres.

Failure modes:

- Ambiguous address → return top 3 candidates, ask user to confirm
- Outside Atlanta metro → reject with waitlist signup
- Commercial property → flag as out-of-scope (residential only)

### Step 2 — Parcel resolution (deterministic)

Input: normalized address. Output: parcel ID + property facts (year built, square feet, type). Use existing Fulton County assessor scraper; extend pattern to DeKalb/Cobb if time allows.

### Step 3 — Agent planning (Sonnet 4.5, ~2-3s)

The agent receives normalized address, parcel data, and the user’s stated intent (flip / rental / primary residence / portfolio_hold). It produces an investigation plan customized to the property’s characteristics — a 1920s quadruplex in Grove Park has different risk signals than a 2015 single-family in Virginia-Highland.

**System prompt:**

```
You are the planning module of PermitCheck's Diligence Agent. Your
job is to produce an investigation plan for a residential property
based on its characteristics and the user's stated investment intent.

You will receive:
- Normalized address, lat/long, parcel ID
- Year built, square feet, property type
- User intent: flip | rental | primary_residence | portfolio_hold

Produce a JSON investigation plan with:
{
  "priority_checks": [...],
  "risk_signals_to_watch": [...],
  "minimum_permit_lookback_years": number,
  "require_contractor_verification": boolean,
  "require_violation_check": boolean,
  "require_aerial_comparison": boolean,
  "estimated_complexity": "low" | "medium" | "high"
}

Guidance:
- Properties built before 1978 → check lead disclosure signals and
  major system permits (electrical, plumbing)
- Properties built before 1950 → extend permit lookback to 50 years
- Multi-unit (duplex/triplex/quadruplex) → check change-of-use
  permits and fire system compliance
- Flip intent → prioritize unpermitted work detection and open
  permit inheritance
- Rental intent → prioritize code violation history and habitability
- Recent sale (<3 years) → focus on seller's ownership period only
```

### Step 4 — Parallel tool calls (10-20s budget)

Tools are TypeScript async functions exposed via Anthropic SDK’s `tools` parameter. Run concurrently with `Promise.all`.

#### Tool: `search_permits`

```typescript
{
  name: "search_permits",
  description: "Search permit records for a specific property by\
    parcel ID or address. Returns structured permit records including\
    permit type, work description, contractor, issue date, final\
    date, status, and valuation.",
  input_schema: {
    type: "object",
    properties: {
      parcel_id: { type: "string" },
      address: { type: "string" },
      jurisdiction: {
        type: "string",
        enum: ["atlanta", "gwinnett", "dekalb", "fulton", "cobb"]
      },
      lookback_years: { type: "integer", default: 25 }
    },
    required: ["jurisdiction"]
  }
}

// Implementation:
// 1. Check Postgres cache (permits joined to properties)
// 2. If cache miss OR cache >30 days old: trigger live scrape
// 3. Return structured array, sorted by issue date desc
```

#### Tool: `get_property_records`

```typescript
{
  name: "get_property_records",
  description: "Fetches property records from the county assessor:\
    ownership history, sale prices, assessed values, recorded square\
    footage, room count, property classification.",
  input_schema: {
    type: "object",
    properties: {
      parcel_id: { type: "string" },
      jurisdiction: { type: "string" }
    },
    required: ["parcel_id", "jurisdiction"]
  }
}
```

#### Tool: `get_contractor_record`

```typescript
{
  name: "get_contractor_record",
  description: "Looks up a contractor by Georgia license number or\
    business name. Returns license status, expiration, disciplinary\
    actions, complaint history from GA Secretary of State licensing\
    database.",
  input_schema: {
    type: "object",
    properties: {
      license_number: { type: "string" },
      business_name: { type: "string" }
    }
  }
}
```

#### Tool: `get_code_violations`

```typescript
{
  name: "get_code_violations",
  description: "Searches code enforcement and housing violation\
    records for the property. Returns violations with date,\
    description, resolution status, associated fines.",
  input_schema: {
    type: "object",
    properties: {
      address: { type: "string" },
      jurisdiction: { type: "string" }
    },
    required: ["address", "jurisdiction"]
  }
}
```

#### Tool: `compare_footprint_to_permits`

```typescript
{
  name: "compare_footprint_to_permits",
  description: "Compares current recorded square footage and room\
    count against permitted changes in the permit history. Flags\
    additions, remodels, or converted spaces that don't appear in\
    the permit record — potential unpermitted work.",
  input_schema: {
    type: "object",
    properties: {
      parcel_id: { type: "string" },
      jurisdiction: { type: "string" }
    },
    required: ["parcel_id", "jurisdiction"]
  }
}
```

#### Tool: `get_permit_document` (called selectively)

```typescript
{
  name: "get_permit_document",
  description: "Retrieves and extracts text from the full permit\
    application PDF. Use only when a permit appears suspicious or\
    incomplete from the structured record — this is expensive\
    (vision model call).",
  input_schema: {
    type: "object",
    properties: { permit_id: { type: "string" } },
    required: ["permit_id"]
  }
}
```

### Step 5 — Analysis (Sonnet 4.5, ~3-5s)

The core analysis call. Cameron writes v1; Alan refines once he joins.

**Output schema:**

```typescript
{
  executive_summary: string,            // 2-3 sentences, plain English
  risk_level: "low" | "medium" | "high",
  permit_timeline: Array<{ year: number, summary: string }>,
  red_flags: Array<{
    category: "unpermitted_work" | "open_permit" | "expired_permit"
            | "code_violation" | "contractor_quality"
            | "ownership_pattern",
    severity: "critical" | "major" | "minor",
    finding: string,
    why_it_matters: string,
    evidence_refs: string[]              // permit_ids, violation_ids
  }>,
  green_signals: string[],
  unpermitted_work_assessment: {
    likelihood: "high" | "medium" | "low" | "none_detected",
    suspected_categories: string[],
    evidence_refs: string[]
  },
  contractor_quality_score: number,     // 1-10
  questions_for_seller: string[],
  recommended_next_steps: string[]
}
```

**Analysis guidelines (excerpt — full prompt lives in `lib/agent/prompts/analyze.ts`):**

1. **Unpermitted work detection.** Assessor sqft >15% above permitted footprint = CRITICAL. Room count increased without permit = MAJOR. Missing finaled dates on major work = MAJOR. Finished basements without matching permit = always flag (top-5 claim driver).
1. **Open/expired permits.** `status='issued'` with no finaled date >12mo old = MAJOR (new owner inherits liability). Expired permits for apparently-complete work = MAJOR.
1. **Code violations.** Open = CRITICAL. Resolved <24mo = MAJOR context. Historical >5yr = MINOR context.
1. **Contractor quality.** License expired at time of permit = MAJOR. >3 disciplinary actions = MAJOR. Repeated low-quality contractor = pattern.
1. **Ownership patterns.** Multiple sales <24mo with permit gaps = investigate cosmetic-flip hiding structural issues.
1. **Insurance implications.** Unpermitted electrical = likely electrical-fire denial. Unpermitted plumbing = water-damage at risk. Roof permits >15yr = underwriting concern.

**Critical rule:** Every red_flag must have populated `evidence_refs`. If you cannot cite evidence, do not make the claim. If data is incomplete, mark as `incomplete_data` rather than guessing. **Do not include legal conclusions** — surface facts and risks; do not advise on permit compliance or what the buyer “should” do legally.

### Step 6 — Depth decision

After initial analysis, decide whether to pull additional records. Triggers: ambiguous permit status, failed contractor lookup, suspected unpermitted addition where the full permit PDF might clarify. **Budget: max 2 additional tool calls.** Without this guardrail, the agent over-investigates and blows the latency budget.

### Step 7 — Report generation (Opus 4.7, ~10-15s)

Opus receives the structured analysis JSON and produces the final report in two formats: HTML for web display, Markdown for PDF generation. **Use structured outputs (JSON mode)** — do not let the LLM generate free-form HTML.

Report sections:

- Header (address, report date, branding)
- Executive Summary (3-4 sentences)
- Risk Assessment (color-coded)
- Permit Timeline (chronological)
- Red Flags (severity, finding, why it matters, evidence)
- Green Signals
- Unpermitted Work Assessment
- Contractor Quality
- Questions for the Seller (copy-paste-ready)
- Recommended Next Steps
- Data Sources & Disclaimers

### Step 8 — Persistence & delivery

- Save JSON to `reports.report_json`
- Render HTML via Server Component
- Generate PDF via Playwright + `@sparticuz/chromium-min`; store in Supabase Storage
- Send email via Resend (link + PDF attached)
- Push Supabase Realtime event to flip status from `generating` to `complete` (or `pending_review` for first 100 reports)

**Status page copy (user-facing):**

```
Step 1: "Looking up the property..."          (5s)
Step 2: "Pulling permit records..."           (15s)
Step 3: "Cross-referencing property records." (10s)
Step 4: "Checking contractor licenses..."     (10s)
Step 5: "Scanning for code violations..."     (8s)
Step 6: "Analyzing findings..."               (15s)
Step 7: "Writing your report..."              (15s)

Total: ~78s typical, 90s ceiling
```

For first 100 reports (admin review gate): final state copy reads “Your report is being finalized — you’ll receive it within an hour” rather than auto-rendering inline.

-----

## 11. Database schema (full DDL)

```sql
-- Profiles extend Supabase Auth users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE properties (
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

CREATE INDEX idx_properties_parcel ON properties(parcel_id);
CREATE INDEX idx_properties_jurisdiction ON properties(jurisdiction);

CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
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

CREATE INDEX idx_permits_property ON permits(property_id);
CREATE INDEX idx_permits_contractor ON permits(contractor_license);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  property_id UUID REFERENCES properties(id),
  raw_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | normalizing | gathering | analyzing | generating
    -- | pending_review | complete | failed
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

CREATE INDEX idx_reports_user ON reports(user_id);
CREATE INDEX idx_reports_status ON reports(status);

CREATE TABLE report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
    -- step_started | step_completed | tool_called | tool_returned | error
  step_name TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_report ON report_events(report_id);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users read own reports" ON reports
  FOR SELECT USING (auth.uid() = user_id);

-- properties and permits are shared infrastructure.
-- Authenticated users can read; only service role writes.
```

**Migration strategy for the existing repo:** parallel tables, `USE_INNGEST_REPORTS` flag gates the cutover. Legacy `lookups` / `permits` (with `lookup_id`) stay alive. New code writes to `properties` / `permits_v2` (with `property_id`) / `reports_v2` / `report_events`. Once the new path runs cleanly in production for 30 days, deprecate legacy tables in a separate PR. **Never edit migrations that have already run** — drop columns and tables in new sequentially-numbered migrations.

-----

## 12. 6-week build plan

### Week 1 — Foundations

- **PR1**: Docs reconciliation — `/CLAUDE.md`, `/docs/SPEC.md`, `/docs/DECISIONS.md` (single combined `CLAUDE.md`, no split deep file)
- **PR1.5**: Collapse the previously-split agent operating manual into a single combined `CLAUDE.md` (Part I / Part II structure)
- **PR1.6**: Delete unused pricing SKUs (`attorney_report`, `agent_plan`), `src/app/api/subscription/*`, drop unused columns via new migration
- **PR2.5**: RLS audit — read `010_fix_rls_policies.sql`, document effective policies on every user-data table, propose `017_rls_hardening.sql` if any `FOR ALL USING (true)` survives for non-service roles. Output: `/docs/RLS_AUDIT.md`
- **PR2.6**: Migration ledger audit — `supabase_migrations.schema_migrations` on prod only records `001/002/003` while DDL from `004`–`015` is fully present. Forensic reconstruction, per-migration replay-safety matrix, backfill plan (Option A insert rows + anomaly capture, vs Option B squash to baseline), operational guardrail blocking `supabase db push` against prod until reconciled. Audit only — no execution. Output: `/docs/MIGRATION_LEDGER_AUDIT.md`. **Blocks PR4 absolutely.** See DECISIONS.md D25.
- **PR2**: Zod-validated env + import discipline + PII redaction in logger + Axiom transport
- **PR3**: Inngest + `@anthropic-ai/sdk` deps + scaffold `/lib/agent/` boundary

### Week 2 — Data layer

- **PR4**: Per-property cache schema migration (parallel tables, RLS, indexes)
- **PR5**: Stripe webhook → Inngest handoff behind `USE_INNGEST_REPORTS` flag. Acceptance includes flipping flag in staging same day, prod within 48 hours
- Port existing Atlanta scraper into the new tool function pattern
- Wrap scrapers as Zod-typed tools

### Week 3 — Agent loop

- **PR6**: Steps 1 + 2 deterministic (normalize + parcel)
- v1 of planning and analysis prompts
- First end-to-end agent run on Greenwich St SW
- Iterate prompts 5-10 times manually
- `report_events` logging for full audit trail

### Week 4 — Report generation & UI

- Steps 5-8 of agent loop
- Report display UI (Server Component)
- Playwright + `@sparticuz/chromium-min` PDF integration
- Resend email integration
- Status page with Supabase Realtime
- Landing page, pricing page, FAQ

### Week 5 — Evaluation & iteration

- **PR7**: Golden set eval harness + Greenwich fixture (blocked on Cameron authoring fixture)
- 10 properties with ground truth
- Iterate prompts until ≥90% recall
- Hallucination detection
- Admin review dashboard for first-100-reports gate
- Prompt caching verification, latency optimization

### Week 6 — Launch prep

- **PR8**: Sentry wiring + magic-link auth migration
- Inngest free → Pro upgrade
- Extend to DeKalb if time permits
- Soft launch to 5 users from Cameron’s network
- Fix issues from soft launch
- Public launch

-----

## 13. Evaluation harness

```typescript
// /evals/run-golden-set.ts
// Run: npm run eval

import { goldenSet } from './golden-set';
import { runAgent } from '../lib/agent';
import { evaluateReport } from './evaluator';

async function main() {
  const results = [];
  for (const prop of goldenSet) {
    const start = Date.now();
    const report = await runAgent(prop.address, prop.intent);
    const duration = (Date.now() - start) / 1000;
    const evaluation = await evaluateReport(report, prop.expected);
    results.push({ property: prop.address, duration, ...evaluation });
  }
  console.table(results);

  const failures = results.filter(r =>
    r.accuracy < 0.9 || r.hallucinations > 0 || r.duration > 120
  );
  if (failures.length > 0) process.exit(1);
}
```

**Evaluator implementation:** Sonnet 4.5 acts as judge with a rubric, comparing the agent’s structured output against the ground-truth fixture. Not Opus (cost), not regex (brittle). The evaluator prompt is versioned in `/evals/evaluator.prompt.md`.

**Hallucination detection** runs separately and is structural: parse the report’s `evidence_refs[]`, verify every entry resolves to an ID present in the gathered data. Set membership, not NLP. Any unresolved ref fails the report.

**Adding to the golden set:** when a production report surfaces a finding (or a missed finding) that should be a permanent test case, add it to `/evals/golden-set/` in the same PR that fixes the underlying issue.

**Greenwich St SW fixture:** Cameron authors this himself. PR7 is blocked on it.

-----

## 14. Non-obvious pitfalls

**LLM timeout handling.** Claude API calls can take 30+s. Use streaming for orchestration. Explicit timeouts: 45s Sonnet, 60s Opus. Never let a hung call block the job indefinitely.

**Tool call argument validation.** Claude will sometimes generate malformed tool calls. Validate every input with Zod before executing. Return structured errors so the model can self-correct.

**Scraping reliability.** Atlanta’s Accela portal throttles regularly. Exponential backoff and circuit breakers. If scraping fails, produce a report from cached data with a clear caveat — don’t fail the whole job.

**Prompt injection via address field.** Sanitize. Reject inputs with instruction-like text (“ignore previous instructions”). Length limit. Log suspected attempts.

**Playwright in serverless is fragile.** `@sparticuz/chromium-min` already a dep. Budget extra time. Browserless / Documint as hosted fallbacks.

**Stripe webhook idempotency.** Stripe sends webhooks multiple times. Always check `stripe_payment_intent_id` uniqueness before enqueuing. The DB has a UNIQUE constraint — let it enforce; handle the conflict gracefully.

**Rate limiting on launch.** A single user submitting 100 addresses in a minute or a scraper running amok blows up cost. Upstash Redis: 5 reports/user/hour during MVP, raise for trusted accounts.

**Prompt caching TTL.** If you don’t hit cached prompts every few minutes, the cache evicts. Skip the warm-up cron until soft launch tells you it’s needed.

**Admin review gate.** First 100 reports go to `pending_review`, not auto-deliver. Status page copy must reflect the wait. Gate is `AUTO_DELIVER_REPORTS=true` env flag; flip when 100 reports show consistent quality. **Applies to the new Inngest path only** — legacy `summary.ts` deliveries on the $9.99 path are unchanged until that path is deleted with the `USE_INNGEST_REPORTS` cutover.

**Inngest free tier limits.** 24-hour event retention, lower concurrency than Pro. Acceptable through soft launch. Upgrade to Pro before public launch.

-----

## 15. Environment variables

```bash
# Core
NEXT_PUBLIC_SITE_URL=https://permitcheck.org
NODE_ENV=production

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL_ORCHESTRATOR=claude-sonnet-4-5
ANTHROPIC_MODEL_REPORTER=claude-opus-4-7

# Stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...

# Google
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...     # autocomplete, domain-restricted
GOOGLE_MAPS_SERVER_KEY=...              # server-side Text Search

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Email
RESEND_API_KEY=...
EMAIL_FROM=...

# Monitoring
SENTRY_DSN=...
AXIOM_TOKEN=...

# Rate limiting
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Feature flags
USE_INNGEST_REPORTS=false              # PR5 dual-path flag; flip after staging verification
AUTO_DELIVER_REPORTS=false             # Admin review gate; flip after 100 reviewed
LOG_FULL_ADDRESS=false                 # Debug-level PII flag
```

All validated by Zod at boot in `lib/env.ts`. Server fails to start on misconfiguration.

-----

*The goal is a product Alan Wiley can run on a real Atlanta property and say “this is real.” Everything flows from there. See `/CLAUDE.md` for engineering conventions and `/docs/DECISIONS.md` for resolutions to design contradictions. Last updated: April 2026.*
