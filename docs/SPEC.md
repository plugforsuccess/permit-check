# SPEC.md — PermitCheck Diligence Agent MVP

Product specification. Pull in `docs/SPEC-deep.md` for the elaborated prompts, tool definitions, week-by-week plan, and pitfalls.

> Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth + Storage) · Claude Sonnet 4.5 (orchestration) · Claude Opus 4.7 (report generation) · Vercel Pro · Inngest. Target: 90-second end-to-end report generation for any Atlanta-metro residential property.

Prepared by Cameron Wiley, Founder & CEO. This document is the source of truth for *what* the MVP does. `/CLAUDE.md` is the source of truth for *how* the code is written.

-----

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

Step-by-step prompts, tool definitions, and analysis guidelines: see `docs/SPEC-deep.md` §4.

-----

## 4. Database schema

Full DDL in `docs/SPEC-deep.md` §3. Key tables:

- **`profiles`** — extends Supabase Auth users with billing/contact fields
- **`properties`** — shared, property-level cache (one row per parcel, 30-day TTL)
- **`permits`** — shared, joined to `properties` (not to user searches)
- **`reports`** — per-user report records, includes `stripe_payment_intent_id` (UNIQUE), `report_json`, `llm_cost_usd`, `duration_seconds`, `status`
- **`report_events`** — append-only audit log of every agent step

Two non-obvious rules:

**`properties` and `permits` are shared infrastructure.** Cached at the property level, not the user level. The 2nd, 3rd, 4th investors looking at the same address share the same cache row. Don’t add `user_id` to these tables — the unit economics depend on this.

**Only the service role writes to `properties`, `permits`, `reports`, and `report_events`.** Clients read their own `reports` rows via RLS. Everything else goes through Server Actions or Inngest.

RLS is on for every table holding user data, default deny, policies in the same migration as the table.

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

**First 100 reports go to `pending_review`** — Cameron reviews before auto-delivery. Status page copy reflects this: “Your report is being finalized — you’ll receive it within an hour.” Auto-deliver is gated by env flag, removed once 100 reports show consistent quality.

### Error paths

- **Payment fails:** standard Stripe retry flow.
- **Agent fails mid-run:** auto-refund (programmatic Stripe API call from the Inngest failure handler), Slack/email alert to Cameron, error stored in `reports.error_message`.
- **Data insufficient:** report delivers with a “limited data” caveat; user offered 50% refund.
- **Property outside Atlanta metro:** rejected before payment, waitlist signup offered.

Status page copy and detailed flow: see `docs/SPEC-deep.md` §5.

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

**Greenwich St SW quadruplex is golden set #1.** Cameron has ground-truth knowledge from active litigation. If the agent’s output contradicts what Cameron knows to be true, the agent is not ready to ship and no other eval result matters.

Eval harness implementation and golden-set authoring guidance: see `docs/SPEC-deep.md` §6.

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
- Supabase RLS enforced on all user-data tables
- No PII in LLM logs (addresses redacted to ZIP+street-name at info level)
- Stripe PCI handled entirely by Checkout

-----

## 8. Open questions for Cameron

Resolved before PR1:

- ✅ Existing Atlanta scraper: in current `permit-check` Next.js codebase
- ✅ Domain: `permitcheck.org` — replace existing pages
- ✅ Supabase: existing project, parallel-table migration strategy
- ✅ Pricing: $29 one-time only for MVP
- ✅ Scope: Atlanta + Gwinnett (already done) + DeKalb if time permits
- ✅ Branding: existing PermitCheck assets

Still open:

- On-call for first 30 days post-launch: Cameron alone, or shared rotation once Alan joins?

-----

*The goal is a product Alan Wiley can run on a real Atlanta property and say “this is real.” Everything flows from there. See `/CLAUDE.md` for engineering conventions and `docs/SPEC-deep.md` for prompts, tool schemas, and the build plan.*
