# CLAUDE.md — PermitCheck

Operating manual for any AI coding agent (Claude Code, Cursor, Codex) working in this repo. Read Part I every session. Pull in Part II when working on the specific area each section covers — the agent loop, the database boundary, infrastructure decisions, or “Why?” questions about architecture.

If anything here conflicts with the spec, the spec wins on *what* to build and this file wins on *how* to build it. If anything is unclear, ask Cameron — don’t guess. See `docs/SPEC.md` for product behavior and acceptance criteria, and `docs/DECISIONS.md` for resolutions to design contradictions surfaced during the build.

-----

## PART I — EVERY-TURN MANUAL

## What this product is

PermitCheck is a paid AI agent that produces an underwriting-grade due diligence report on any Atlanta-metro residential property in under 90 seconds for $29.

**The agent IS the product.** UI exists to deliver the report. Every code change should make the agent faster, more accurate, more reliable, or cheaper. If it doesn’t, push back before building it.

-----

## Stack

Next.js 16 (App Router) · TypeScript strict · Supabase (Postgres + Auth + Storage) · Inngest (background jobs) · Anthropic SDK (Sonnet 4.5 orchestration, Opus 4.7 reporter) · Stripe Checkout · Resend · Playwright (`@sparticuz/chromium-min` for serverless PDF) · Vercel Pro · Sentry + Axiom · Upstash Redis (rate limit) · npm.

> Recent Next.js may not match training data. Check `node_modules/next/dist/docs/` before writing routes, layouts, or server actions.

-----

## The agent boundary

The product is split into two execution contexts. They have different rules.

**Deterministic layer (no LLM):** address normalization, parcel resolution, permit scraping, cache lookups, footprint math, Stripe webhooks, PDF rendering. Normal typed Node.js. If a deterministic step starts using an LLM, that’s a design change — flag it in the PR.

**LLM layer:** planning (Sonnet), analysis (Sonnet), report generation (Opus). Rules for every LLM call:

1. Native Anthropic SDK only. No LangChain, no LangGraph, no MCP in the production runtime.
1. Every tool input and output is Zod-validated. Return structured errors so the model can self-correct.
1. Prompt caching on by default. System prompts and tool definitions cached; per-request data uncached. Day 1, not Week 5.
1. Explicit timeouts: Sonnet 45s, Opus 60s. Hung calls fail fast and the step retries.
1. Streaming for orchestration so we can log progress.
1. Cite or omit. Every factual claim references an ID present in gathered data. Hallucination check enforces this in CI.

MCP is fine and encouraged in `.claude/` for the dev loop (Supabase migrations, GitHub PRs, Vercel logs). It does not appear in `/lib/agent/**`. See Part II for the full rationale.

-----

## Conventions

**TypeScript.** Strict mode on. No `any`. Prefer `unknown` over `any` when narrowing. No barrel files (`index.ts` re-exports). Discriminated unions for state machines.

**React / Next.js.** Server Components by default. `"use client"` only for state, effects, or browser APIs. Server Actions for new mutations. Existing API-route mutations are grandfathered — migrate opportunistically when touched. API routes are reserved for webhooks (Stripe, Inngest, Resend bounce handling). No client-side Supabase writes, ever. Suspense boundaries around any async Server Component >100ms. `loading.tsx` and `error.tsx` for every route segment that fetches data.

**Database.** Migrations in `/supabase/migrations`, sequentially numbered, immutable after merge. RLS on for every table holding user data. Default deny. Policies in the same migration as the table. Indexes in the same migration as the table. Service role is server-only — if you need it in a Client Component, ask first.

**Errors.** No silent catches. Every catch re-throws, logs to Axiom with context, or returns a typed error. User-facing errors never leak internals. Agent failures auto-refund via Stripe (programmatic, not human alert) and log to `reports.error_message` for replay.

**Logging.** Structured JSON to Axiom. Required fields: `report_id`, `step_name`, `event_type`, `duration_ms`. No PII at info level — strip addresses to ZIP+street-name. Full address only at debug, gated by env flag. `console.log` is fine in scripts; never in committed app code.

**Environment variables.** Validated with Zod at boot via `lib/env.ts`. Server fails to start on misconfiguration. Never read `process.env.X` directly — import from `lib/env.ts`. Secrets never appear in `NEXT_PUBLIC_*`.

**Git.** `main` deploys to production; direct pushes blocked. Feature branches → PR → Cameron reviews → squash merge. Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `eval:`). PRs touching `/lib/agent/**` or `/lib/scraping/**` must include eval results.

-----

## Evals are the merge gate

```bash
npm run eval
```

Runs the golden set in `/evals/golden-set/`. Thresholds:

- Critical red flag recall: ≥90%
- Hallucinations (uncited claims): 0
- p95 duration: ≤120s
- Cost per report: ≤$2.00

If any threshold fails, the PR does not merge. Threshold changes are a separate PR with justification, reviewed by Cameron.

The Greenwich St SW quadruplex is golden set #1. Cameron has ground-truth knowledge from active litigation. If the agent’s output contradicts what Cameron knows to be true, the agent is not ready to ship and no other eval result matters.

Hallucination detection is structural, not semantic: red flags are emitted with a required `evidence_refs: string[]` field; every entry must resolve to an ID present in the gathered data. Set membership, not NLP.

-----

## Autonomy

**Do without asking:** refactor inside a single file in `/components`, `/lib/scraping`, or `/lib/pdf`. Add tools to `/lib/agent/tools/` following the existing pattern. Add jurisdictions following the Atlanta pattern. Update tests, fix typos, bump non-major deps. Add Sentry/Axiom instrumentation. Improve error messages.

**Ask Cameron first:** schema changes (new tables, columns, RLS policies). Changes to `/lib/agent/orchestrator.ts` or any prompt file. New external dependencies. Anything touching Stripe, Resend webhooks, or auth. Pricing logic. Anything that raises LLM cost per report. Removing or weakening an eval threshold.

When in doubt, ask. A 30-second Slack message is cheaper than a wrong rebuild.

-----

## Hard “do not” rules

- **No MLS data scraping.** ToS violation; legal risk to PermitCheck.
- **No legal conclusions in reports.** The agent surfaces facts and risks. It does not advise on permit compliance, code violations, or what the buyer “should” do legally. PermitCheck is adjacent to active litigation involving Cameron — output that reads as legal advice creates liability.
- **No MCP in the production agent runtime.** See Part II for why.

-----

## PART II — DEEP REFERENCE

The remainder of this document is the engineering reference shelf. Pull in the relevant section when the task touches that area. None of this should be loaded by Claude Code on every turn — only when the task is in scope.

-----

## Repository layout

```
/src
  /app                    # Next.js App Router
    /(marketing)          # Public pages (landing, pricing, FAQ)
    /(app)                # Authenticated app (dashboard, reports)
    /api                  # Webhook handlers (Stripe, Inngest, Resend bounce)
  /components
    /ui                   # shadcn primitives — do not edit directly
    /report               # Report display components
    /forms                # Form components
  /lib
    /agent
      /prompts            # System prompts as exported strings
      /tools              # Tool function implementations (one file per tool)
      /steps              # One file per agent step (normalize, parcel, plan, ...)
      /orchestrator.ts    # Main agent loop
      /schemas.ts         # Zod schemas for tool inputs/outputs
    /supabase             # createServerClient / createBrowserClient
    /stripe               # Stripe client + webhook handlers
    /scraping
      /atlanta            # Existing Accela scraper (Playwright)
      /gwinnett           # Already implemented; supported jurisdiction
      /dekalb
      /fulton-county
      /cobb
    /pdf                  # PDF generation (Playwright + @sparticuz/chromium-min)
    /email                # Email templates and send helpers
    /env.ts               # Zod-validated env, single source of truth
  /inngest                # Inngest job definitions
/supabase
  /migrations             # SQL migrations — sequential, never edited after merge
/evals
  /golden-set             # JSON fixtures with ground-truth reports
  /run-golden-set.ts
  /evaluator.ts
/scripts                  # One-off scripts (data backfill, etc.)
/docs
  /SPEC.md                # Product specification + implementation reference
  /DECISIONS.md           # Resolutions to audit contradictions
```

When adding a file, place it where similar files live. If no precedent exists, propose a location in the PR description before creating it.

-----

## The agent loop in code terms

Eight steps, orchestrated in Inngest with a checkpoint between each so any step can resume on failure.

|Step|What                    |Where                         |Latency budget         |
|----|------------------------|------------------------------|-----------------------|
|1   |Address normalization   |`lib/agent/steps/normalize.ts`|5s                     |
|2   |Parcel resolution       |`lib/agent/steps/parcel.ts`   |5s                     |
|3   |Planning (Sonnet)       |`lib/agent/steps/plan.ts`     |3s                     |
|4   |Parallel tool calls     |`lib/agent/steps/gather.ts`   |20s                    |
|5   |Analysis (Sonnet)       |`lib/agent/steps/analyze.ts`  |5s                     |
|6   |Depth decision          |`lib/agent/steps/depth.ts`    |10s (max 2 extra calls)|
|7   |Report generation (Opus)|`lib/agent/steps/generate.ts` |15s                    |
|8   |Persistence + delivery  |`lib/agent/steps/deliver.ts`  |5s                     |

Hard ceiling: 120s. p50 target: <80s. If a step exceeds its budget twice in a row in production, alert and investigate before shipping more features.

Step 4 uses `Promise.all` for the initial parallel dispatch. Investigate Anthropic’s Programmatic Tool Calling once the loop is stable — it can collapse the dispatch into a single inference call.

Full prompts, tool schemas, and analysis guidelines: `docs/SPEC.md` §10.

-----

## Database boundary

Schema is defined in `/supabase/migrations`. Key tables (full DDL in `docs/SPEC.md` §11): `profiles`, `properties`, `permits`, `reports`, `report_events`.

Two non-obvious rules.

**`properties` and `permits` are shared infrastructure.** Cached at the property level, not the user level, with a 30-day TTL. Multiple users looking at the same address share the same cache row. Don’t add `user_id` to these tables. The whole unit-economics story depends on this caching.

**Only the service role writes to `properties`, `permits`, `reports`, and `report_events`.** Clients read their own `reports` rows via RLS. Everything else goes through Server Actions or Inngest jobs.

Migration discipline: every migration runs on a fresh Postgres in CI before merge. If `supabase db reset` fails locally, the migration is broken — fix it before opening the PR. Never edit a migration that has already run — drop columns and tables in new sequentially-numbered migrations.

**Migration strategy for the existing repo:** parallel tables. Legacy `lookups` / `permits` (with `lookup_id`) stay alive behind `USE_INNGEST_REPORTS=false`. New code writes to `properties` / `permits_v2` (with `property_id`) / `reports_v2` / `report_events`. Once the new path runs cleanly in production for 30 days, deprecate legacy tables in a separate PR.

-----

## Why no MCP in the production runtime

MCP is excellent for development tooling and chat-based workflows. It is the wrong abstraction for our hot path.

- Every MCP call adds a network hop and a serialization round-trip we can’t afford against a 90-second p95 budget.
- Our tools are tightly coupled to our schema, our cache, and our scrapers. The MCP boundary buys us nothing — the tools are not reused across products.
- Anthropic’s native tool use gives us prompt caching, streaming, and programmatic tool calling out of the box.

MCP is encouraged in `.claude/` for the dev loop (Supabase migrations, GitHub PRs, Vercel logs). It does not appear in `/lib/agent/**`.

-----

## Non-obvious pitfalls

**Vercel function timeout** is 60s on Pro for standard functions. Reports run in Inngest, not API routes. If you find yourself adding `maxDuration` to something that calls Claude, you’re in the wrong place.

**Stripe webhooks fire multiple times.** Always check `stripe_payment_intent_id` uniqueness before enqueuing a job. There’s a unique constraint on the column — let the DB enforce it and handle the conflict gracefully.

**Accela goes down.** City of Atlanta’s portal throttles and times out regularly. Scrapers have exponential backoff and circuit breakers. If scraping fails, the agent produces a report from cached data with a clear caveat — never fail the whole job.

**Address field is an injection vector.** User-submitted addresses flow into LLM prompts. Reject inputs containing instruction-like text, enforce a length limit, log suspected attempts.

**Playwright in serverless is fragile.** Use `@sparticuz/chromium-min`. Budget extra time. Hosted alternatives (Browserless, Documint) are acceptable fallbacks.

**Prompt caching has a TTL.** If you don’t hit cached prompts every few minutes, the cache evicts. This matters if traffic is spiky during launch — revisit warm-up cron at soft launch, not before.

**Admin review gate.** First 100 production reports go to `pending_review` status, not auto-delivered. Status page copy reflects this: “Your report is being finalized — you’ll receive it within an hour.” Friction is the feature. Gate is `AUTO_DELIVER_REPORTS=true` env flag, removed once 100 reports show consistent quality. **Applies to the new Inngest path only** — legacy `summary.ts` deliveries on the $9.99 path are unchanged until that path is deleted.

**Inngest free tier limits.** 24-hour event retention, lower concurrency than Pro. Acceptable through soft launch. Upgrade to Pro before public launch — wire PR3 against free-tier assumptions but plan for the upgrade.

-----

## North Star

Cameron is building this so his father Alan, joining as Co-Founder & President, can run the agent on a real Atlanta property and say “this is real.” Every line of code is in service of that moment.

Speed, accuracy, citation, and cost discipline are the four things that make Alan say yes. Pretty UI, clever abstractions, and infrastructure flex do not. When the trade-off is between “faster, more accurate, cheaper” and anything else, pick the first three.

-----

*Last updated: April 2026. Owner: Cameron Wiley. If this file is more than 90 days out of date or contradicts current behavior, that’s a bug — fix it in a `docs:` PR.*
