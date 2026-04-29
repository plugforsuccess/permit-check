# CLAUDE.md — PermitCheck

Operating manual for any AI coding agent (Claude Code, Cursor, Codex) working in this repo. Read this file every session. Pull in `docs/CLAUDE-deep.md` for the agent loop, pitfalls, and rationale; pull in `docs/SPEC.md` for product behavior and acceptance criteria.

If anything here conflicts with the spec, the spec wins on *what* to build and this file wins on *how* to build it. If anything is unclear, ask Cameron — don’t guess.

-----

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

MCP is fine and encouraged in `.claude/` for the dev loop (Supabase migrations, GitHub PRs, Vercel logs). It does not appear in `/lib/agent/**`. See `docs/CLAUDE-deep.md` for the full rationale.

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
- **No MCP in the production agent runtime.** See `docs/CLAUDE-deep.md` for why.

-----

*See `docs/CLAUDE-deep.md` for the agent loop in code terms, pitfalls, and the MCP rationale. See `docs/SPEC.md` for product behavior, schema DDL, and acceptance criteria. Last updated: April 2026.*
