# Decisions log — PermitCheck

This file records contradictions between `CLAUDE.md`, `docs/SPEC.md`, and the
existing codebase, plus the resolutions Cameron signed off on. New
contradictions go at the top with a date and resolution. Old entries stay —
we don't delete history.

Format: each entry is a short heading, the conflict, and the resolution. If a
resolution changes later, add a new dated entry pointing back to the old one
rather than editing it in place.

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
