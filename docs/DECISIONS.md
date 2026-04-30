# Decisions log — PermitCheck

This file records contradictions between `CLAUDE.md`, `docs/SPEC.md`, and the
existing codebase, plus the resolutions Cameron signed off on. New
contradictions go at the top with a date and resolution. Old entries stay —
we don't delete history.

Format: each entry is a short heading, the conflict, and the resolution. If a
resolution changes later, add a new dated entry pointing back to the old one
rather than editing it in place.

-----

## 2026-04-30 — Migration ledger drift (RESOLVED via PR2.7)

### D25. `supabase_migrations.schema_migrations` only records 001–003 on prod
- **Conflict:** The Supabase project `unjwbyybzfyhiavorcro` has all 15 local
  migrations' DDL effects present (every column, table, index, and policy from
  `001`–`015` exists, verified via MCP read-only queries against `pg_class`,
  `pg_policies`, and `information_schema.columns`), but
  `supabase_migrations.schema_migrations` only contained rows for
  `001/002/003`. Twelve migrations were applied through a non-CLI path (almost
  certainly the SQL Editor) and the ledger never learned about them. Two extra
  objects existed on prod with **no migration source at all** in the repo:
  `permits_lookup_record_unique` (UNIQUE on `permits(lookup_id, record_number)`)
  and `reports_lookup_id_key` (UNIQUE on `reports(lookup_id)`). A
  `supabase db push` against prod would have attempted to replay `004`–`015`;
  `009` and `010` are **not safe to replay as written** (the `CREATE POLICY`
  statements lack `IF NOT EXISTS` guards and would error mid-migration,
  leaving the schema half-applied). Full forensic detail and replay-safety
  matrix: `/docs/MIGRATION_LEDGER_AUDIT.md`.
- **Resolution:** Option A executed in PR2.7 on 2026-04-30. Cameron
  authorized direct application to prod (skipping the originally-planned
  staging-first step) because `016_ledger_backfill.sql` is fully idempotent:
  ledger inserts use `ON CONFLICT (version) DO NOTHING`; the two anomaly
  constraints are guarded by `pg_constraint` existence checks in `DO $$`
  blocks. Both anomaly UNIQUEs were verified intentional (required by
  application code paths — see `016_ledger_backfill.sql` header comment).
  Post-execution state of `supabase_migrations.schema_migrations`: rows
  `001`–`016` present, contiguous, matching the repo. Both anomaly
  constraints captured authoritatively. `supabase db diff` is now expected
  to return zero schema changes against the repo (not yet run from a clone
  with CLI access; should be the next staging-up verification).
- **Operational guardrail (still in effect — does not lapse with D25's
  resolution):**
  1. ~~No `supabase db push` against prod.~~ Theoretically safe again
     post-PR2.7, but the label gate below makes it moot — no migration
     reaches prod without the CI guardrail passing.
  2. ~~No `supabase migration up` against prod.~~ Same as above.
  3. **Every PR that touches `/supabase/migrations/**` requires the
     `migration-approved` label** before it can merge. Enforced by
     `.github/workflows/migration-guard.yml`. Only Cameron grants the
     label, after either staging verification or an explicit
     known-idempotent override (the latter is what happened for PR2.7).
  4. All DDL changes to prod continue to flow through the SQL Editor or
     the MCP `apply_migration` tool — both write the file *and* the
     ledger row atomically, the way `001/002/003` originally landed.
  5. Staging environments rebuild cleanly from `/supabase/migrations`
     against an empty DB and are the default proving ground for any
     migration before prod. (As of 2026-04-30 there is no staging
     project; setup is its own follow-up.)

  Full operational policy: `/docs/MIGRATION_GUARDRAIL.md`.

-----

## 2026-04-29 — Week 1 audit findings (open)

### D19. Live pricing in code vs. MVP scope
- **Conflict:** `src/lib/config.ts:20–25` ships `singleLookup: 999` ($9.99),
  `attorneyReport: 19900` ($199), `buyerPlan: 2900` ($29/mo), `agentPlan: 9900`
  ($99/mo). D8 ruled MVP at "$29 one-time only" and deferred the $99/mo
  subscription to v1.1. Three of four live SKUs disagree with D8. Affected
  surface: `migrations/001_initial_schema.sql:27` (`report_type` column),
  `migrations/008_agent_subscription.sql`, `src/app/api/subscription/*`,
  `README.md:24`.
- **Resolution:** Pending Cameron. Options: (a) flip `singleLookup` to $29 and
  remove the other three SKUs for MVP, (b) keep them dormant behind a feature
  flag, or (c) revise D8. No code change until resolved.

### D20. Attorney-grade report SKU undocumented
- **Conflict:** `report_type: 'standard' | 'attorney'` runs through the schema
  (`migrations/001_initial_schema.sql:27`), checkout
  (`src/app/api/checkout/create/route.ts:102–106`), the webhook PDF path
  (`src/app/api/webhooks/stripe/route.ts:199–253`), and
  `migrations/006_matter_reference.sql`. Neither `SPEC.md` nor `CLAUDE.md`
  mentions an attorney-grade tier.
- **Resolution:** Pending Cameron. Either fold under the $29 MVP and drop, or
  write the SKU into SPEC §1 / §11. Tied to D19.

### D21. Auth uses passwords, not magic-link
- **Conflict:** SPEC §3 ("email + magic link, no password") and §5
  ("magic-link auth (email)") versus `src/app/dashboard/page.tsx:75–95`, which
  calls `supabase.auth.signUp({ email, password })` and
  `signInWithPassword`. Recent commit `eacd9ef` added a show/hide password
  toggle — the codebase is moving *toward* passwords, not away.
- **Resolution:** Pending Cameron. Switch to magic-link before launch (and
  remove the password UI), or amend SPEC §3/§5 to allow passwords for v0.

### D22. Vitest path alias is broken
- **Conflict:** `vitest.config.ts:4` defines the alias key as `"@/"` (trailing
  slash). Standard `@/lib/...` imports resolve to `./src//lib/...` and fail.
  Existing tests in `src/__tests__/` use relative paths to dodge the bug; new
  tests written per the spec's convention will fail.
- **Resolution:** Fix as part of PR6 (eval harness): change the alias key to
  `"@"` and the value to `./src`. No controversy — recorded here for the
  trail.

### D23. `lib/env.ts` is not Zod-validated and does not fail at boot
- **Conflict:** `CLAUDE.md` §4 requires "Validated with Zod at boot via
  `lib/env.ts`. Server fails to start on misconfiguration. Never read
  `process.env.X` directly." Reality: `src/lib/env.ts:10–45` is a string-array
  check called lazily from API routes, and `src/lib/config.ts:3–10` reads
  `process.env.X` directly with `|| ""` fallbacks (silent misconfig). D13
  already schedules PR2 for PII redaction but does not capture the
  Zod-at-boot requirement itself.
- **Resolution:** Lands in PR2 alongside D9 and D13. Replace lazy validation
  with a Zod schema validated at module load; route `config.ts` through the
  typed export; remove direct `process.env.X` reads outside `lib/env.ts`.

### D24. Webhook does PDF + email + summary inline (beyond the agent run)
- **Conflict:** D6 addresses moving the *report generation* off the webhook.
  The same webhook (`src/app/api/webhooks/stripe/route.ts:152–310`) also runs
  property-data fetch, AI summary, PDF generation (with a 20s race), Storage
  upload, and Resend email — all within the Stripe 30s budget. Per
  `CLAUDE.md` §11, the same anti-pattern applies to the side-effects chain,
  not just the analysis call.
- **Resolution:** Lands in PR5 alongside D6. The post-payment side effects all
  move into Inngest steps; the webhook becomes "verify, mark paid, enqueue,
  return 200." Same `USE_INNGEST_REPORTS` flag and same 48h
  staging→production cutover.

-----

## 2026-04-29 — PR1 docs reconciliation

### D1. Next.js version
- **Conflict:** Spec §2 said "Next.js 14"; old `CLAUDE.md` said "Next.js 16";
  `package.json` is `next@16.2.0`.
- **Resolution:** Stay on 16.2.0. Both docs updated to match.

### D2. Scraper engine
- **Conflict:** New `CLAUDE.md` §2 prescribed Puppeteer for scraping; the
  working code in `src/lib/accela/scraper.ts` uses `playwright-core`.
- **Resolution:** Keep Playwright for scraping. Puppeteer (`puppeteer-core` +
  `@sparticuz/chromium-min`) stays for PDF generation only. `CLAUDE.md` §2
  updated.

### D3. Supported jurisdictions
- **Conflict:** Both docs listed `atlanta | dekalb | fulton | cobb`; the code
  ships `ATLANTA_GA` and `GWINNETT_GA` (`src/lib/accela/jurisdictions.ts`).
- **Resolution:** Add Gwinnett to the supported list. The full set going
  forward is `atlanta | dekalb | fulton | cobb | gwinnett`. The
  `search_permits` tool enum in spec §4 will include `gwinnett`.

### D4. Package manager
- **Conflict:** `CLAUDE.md` §8 referenced `pnpm eval`; repo has
  `package-lock.json` (npm).
- **Resolution:** Standardize on npm. `CLAUDE.md` updated to `npm run eval`.

### D5. Per-search vs per-property cache
- **Conflict:** Existing schema (`supabase/migrations/001_initial_schema.sql`)
  uses `lookups` + `permits.lookup_id` (per-search); spec §3 and `CLAUDE.md`
  §7 require `properties` + `permits.property_id` (per-property, 30-day TTL,
  shared across users).
- **Resolution:** Parallel tables. PR4 adds `properties`, `permits_v2`,
  `report_events`, `reports_v2` in a new migration. Legacy `lookups` and
  `permits` stay live behind the `USE_INNGEST_REPORTS` flag. Legacy
  deprecation is a separate PR scheduled 30 days after the new path runs
  cleanly in production. **Do not** one-shot replace.

### D6. Reports in webhook vs Inngest
- **Conflict:** `src/app/api/webhooks/stripe/route.ts:200` runs the report
  inline with a self-imposed 20s budget — exactly the anti-pattern called
  out in `CLAUDE.md` §11. The 90s p95 target cannot be hit inside a Stripe
  webhook.
- **Resolution:** PR3 wires Inngest. PR5 swaps the webhook to enqueue a
  `report.requested` event and return 200 immediately, gated on
  `USE_INNGEST_REPORTS`. **PR5 acceptance criteria explicitly include
  flipping the flag to true in staging on the same day PR5 merges, and in
  production within 48 hours.** The dual-path does not live indefinitely.

### D7. API routes vs Server Actions for mutations
- **Conflict:** `CLAUDE.md` §4 says "Server Actions for mutations. API routes
  are reserved for webhooks." Repo has 22 API-route mutations
  (`/api/watchlist/add`, `/api/user/onboarding`, `/api/lookup/initiate`,
  `/api/checkout/create`, etc.).
- **Resolution:** Forward-only. New mutations are Server Actions; the
  existing 22 are grandfathered and will be migrated opportunistically when
  touched for other reasons. `CLAUDE.md` §4 updated.

### D8. Pricing
- **Conflict:** Spec §11 acceptance required both `$29` one-time and `$99/mo`
  subscription Stripe flows.
- **Resolution:** Ship `$29` one-time only for MVP. Subscription is a v1.1
  feature. Spec §11 updated.

### D9. Model IDs
- **Conflict:** `src/lib/summary.ts:433` uses `claude-sonnet-4-20250514`.
  Spec/`CLAUDE.md` say "Sonnet 4.5" / "Opus" without pinned IDs.
- **Resolution:** Pin via env vars in PR2:
  - `ANTHROPIC_MODEL_ORCHESTRATOR=claude-sonnet-4-5`
  - `ANTHROPIC_MODEL_REPORTER=claude-opus-4-7`

  Fallback if cost-per-report on the golden set exceeds `$2.00`: downgrade
  reporter to `claude-opus-4-6`. **Do not** downgrade the reporter to a
  Sonnet — quality is the product on the generation step.

### D10. MLS data and unauthorized practice of law
- **Conflict:** Old `CLAUDE.md` had two "Do not" rules that the new
  comprehensive draft dropped: no scraping FMLS/GAMLS (ToS violation), and
  no legal conclusions in user-facing copy.
- **Resolution:** Both reinstated in `CLAUDE.md` §11. The legal-conclusions
  rule is non-negotiable given the Greenwich St litigation — output that
  could be characterized as the unauthorized practice of law is a real
  liability for Cameron personally, not just for the product.

### D11. Admin review gate
- **Conflict:** Spec §6 requires Cameron-reviewed first 100 reports; PR plan
  did not surface this in the user-facing flow.
- **Resolution:** PR5 writes reports as `pending_review` and gates
  auto-delivery behind `AUTO_DELIVER_REPORTS` (default false until 100
  reviewed reports clear). Status page copy switches from "Your report is
  ready" to "Your report is being finalized — you'll receive it within an
  hour."

### D12. Refund policy
- **Conflict:** Spec §5 and §11 both call for auto-refund; ambiguity over
  whether "auto" meant programmatic or alert-Cameron-to-click.
- **Resolution:** Programmatic. Inngest failure handler issues the Stripe
  refund. A Slack/email notification fires to Cameron on every auto-refund
  for visibility, but the refund itself does not wait for human action.

### D13. PII redaction in logs
- **Conflict:** `CLAUDE.md` §4 requires address stripping (ZIP + street name
  only at info level; full address debug-only behind env flag);
  `src/lib/logger.ts` has no redaction.
- **Resolution:** Lands in PR2 alongside the env work, not a separate PR.

### D14. Inngest tier
- **Conflict:** None in the docs; question was whether to start paid.
- **Resolution:** Free tier. Re-evaluate at 100 reports/month or first
  observability gap, whichever comes first.

### D15. Prompt-cache warm-up cron
- **Conflict:** `CLAUDE.md` §11 flags cache eviction during low traffic;
  question was whether to ship a warm-up now.
- **Resolution:** Wait. Adding a synthetic cron during the eval-driven phase
  burns tokens for no reason. Revisit at soft launch.

### D16. Greenwich St SW ground truth
- **Resolution:** Cameron authors the JSON fixture personally. Dev drafts
  the structural skeleton from scraped data so Cameron has a starting point
  to correct, but red flags, severities, and known unpermitted findings
  come from Cameron's head. **PR7 is blocked on Cameron, not on the dev.**
  Budget: ~2 hours of Cameron's time.

### D17. Repo layout (`src/` prefix)
- **Conflict:** `CLAUDE.md` §3 prescribed root-level `/app /components /lib`;
  repo uses Next.js `src/` layout (`src/app`, `src/components`, `src/lib`).
- **Resolution:** Keep the `src/` layout. `CLAUDE.md` §3 updated to use the
  `src/` prefix. No code move.

### D18. Barrel files
- **Conflict:** `CLAUDE.md` §4 forbids barrel files; `src/lib/accela/index.ts`
  exists.
- **Resolution:** Grandfathered. Remove opportunistically when the file is
  touched for other reasons. Do not write new barrel files.
