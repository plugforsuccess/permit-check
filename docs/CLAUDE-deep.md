# CLAUDE-deep.md — PermitCheck deep reference

Companion to `/CLAUDE.md`. Pull this file in when working on the agent loop, the database boundary, infrastructure decisions, or anything covered by “Why?” questions about the architecture. The root file is the every-turn manual; this is the reference shelf.

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
      /dekalb
      /fulton-county
      /cobb
      /gwinnett           # Already implemented; supported jurisdiction
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
  /SPEC.md                # Product specification
  /CLAUDE-deep.md         # This file
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

-----

## Database boundary

Schema is defined in `/supabase/migrations`. Key tables (full DDL in `docs/SPEC.md` §3): `profiles`, `properties`, `permits`, `reports`, `report_events`.

Two non-obvious rules.

**`properties` and `permits` are shared infrastructure.** Cached at the property level, not the user level, with a 30-day TTL. Multiple users looking at the same address share the same cache row. Don’t add `user_id` to these tables. The whole unit-economics story depends on this caching.

**Only the service role writes to `properties`, `permits`, `reports`, and `report_events`.** Clients read their own `reports` rows via RLS. Everything else goes through Server Actions or Inngest jobs.

Migration discipline: every migration runs on a fresh Postgres in CI before merge. If `supabase db reset` fails locally, the migration is broken — fix it before opening the PR.

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

**Admin review gate.** First 100 production reports go to `pending_review` status, not auto-delivered. Status page copy reflects this: “Your report is being finalized — you’ll receive it within an hour.” Friction is the feature. Gate is removed via env flag once 100 reports show consistent quality.

-----

## North Star

Cameron is building this so his father Alan, joining as Co-Founder & President, can run the agent on a real Atlanta property and say “this is real.” Every line of code is in service of that moment.

Speed, accuracy, citation, and cost discipline are the four things that make Alan say yes. Pretty UI, clever abstractions, and infrastructure flex do not. When the trade-off is between “faster, more accurate, cheaper” and anything else, pick the first three.

-----

*Last updated: April 2026. Owner: Cameron Wiley. If this file is more than 90 days out of date or contradicts current behavior, that’s a bug — fix it in a `docs:` PR.*
