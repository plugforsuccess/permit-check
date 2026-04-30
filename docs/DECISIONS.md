# Decisions log — PermitCheck

This file records contradictions between `CLAUDE.md`, `docs/SPEC.md`, and the
existing codebase, plus the resolutions Cameron signed off on. New
contradictions go at the top with a date and resolution. Old entries stay —
we don't delete history.

Format: each entry is a short heading, the conflict, and the resolution. If a
resolution changes later, add a new dated entry pointing back to the old one
rather than editing it in place.

-----

## 2026-04-30 — PR5 prep: flag-flip ceremony, anonymous payments, intent default

### D33. `USE_INNGEST_REPORTS` flag-flip ceremony moves from PR5 to PR6
- **Conflict:** The original cutover rule (specified before the agent
  loop scaffolding strategy was finalized) said `USE_INNGEST_REPORTS`
  flips to `true` in staging the same day PR5 merges, and in prod
  within 48h. PR3 ships the orchestrator with eight `step.run` calls
  that all throw `not_implemented` until real implementations land.
  Flipping the flag in PR5 with stub steps produces only failed report
  runs — no useful signal, only Inngest dashboard noise.
- **Resolution:** **The flip ceremony moves from PR5 to PR6.** PR5
  ships the plumbing with `USE_INNGEST_REPORTS=false` as the default.
  The flag flips to `true` in staging the same day PR6 (deterministic
  steps 1+2: normalize + parcel) lands, and to prod within 48h of
  staging verification. The 48-hour staging-to-prod window is unchanged;
  only the trigger PR moves.
- **Why this gets a `DECISIONS.md` entry instead of just doing it:** A
  deviation from a documented rule, even a correct deviation, lands in
  the docs or it becomes precedent for "we don't have to follow the
  documented rule when it's inconvenient." Document the change, follow
  the changed rule, hold the line. Same logic as the staging
  conversation (D26 pre-customer extension) and the schema-deviation
  process note (D32 process tail).
- **Affected files:** `docs/PR_ROADMAP.md` PR5 entry (rule rewritten);
  PR6 entry (flip ceremony added as acceptance).

### D34. Anonymous payments stay on legacy path during the dual-path window
- **Conflict:** `reports_v2.user_id` is `NOT NULL` (PR4 / migration 019).
  Legacy `lookups.user_id` is nullable — anonymous lookups exist today.
  When `USE_INNGEST_REPORTS=true` flips (PR6), an anonymous payer's
  `reports_v2` insert fails on the NOT NULL constraint.
- **Resolution:** During the dual-path window, payments where
  `lookups.user_id IS NULL` route to the **legacy inline path** instead
  of the new Inngest path. The new path's branch logic in
  `src/app/api/webhooks/stripe/route.ts` checks `lookup.user_id` first
  and falls through to legacy when null. The branch is named explicitly
  (not a buried `if (!user_id)`) and tagged with a `TODO(D34)` comment
  pointing here.
- **Trigger to retire:** PR8 (magic-link auth) makes authentication a
  precondition for payment. After PR8 ships, unauthenticated checkout
  paths are removed and the D34 branch is unreachable. **The branch
  deletion happens in PR8 itself, not as a follow-up** — same PR that
  removes the unauth path also removes the dead-code branch.
- **Do not** migrate this branch's logic into a permanent design
  pattern. It exists to bridge a known gap during a known window.

### D35. Report intent hardcoded to `"flip"` until form collection ships
- **Conflict:** The `report.requested` Inngest event schema (PR3,
  `src/inngest/orchestrator.ts`) requires
  `intent: "flip" | "rental" | "primary_residence" | "portfolio_hold"`.
  The current lookup form does not collect investor intent. PR5 needs
  to emit the event from the Stripe webhook with a populated `intent`.
- **Resolution:** **PR5 hardcodes `intent: "flip"`** in the
  `report.requested` event payload via a named constant
  (`DEFAULT_REPORT_INTENT` in `src/lib/agent/schemas.ts` or a sibling
  constants file) so the future form-rebuild PR is a one-line change,
  not a grep-and-replace. The constant carries a `TODO(D35)` comment
  pointing here.
- **Why "flip" specifically (not "rental" or another default):** Flip
  is the most common investor case in the target Atlanta-metro market.
  More importantly, the planning step's behavior on flip-intent
  (prioritize unpermitted-work detection and open-permit inheritance,
  per SPEC §10 Step 3) is the **safest default**. A flip-tuned report
  on a rental property still surfaces the right red flags even if the
  framing is slightly off. The reverse — a rental-tuned report on a
  flip property — misses the most expensive failure modes. The
  asymmetry favors flip-intent as the conservative default.
- **Trigger to retire:** when the lookup form is rebuilt to collect
  intent (separate post-MVP PR). Until then, every report runs as
  flip-intent.

-----

## 2026-04-30 — PR4 user-data write pattern (permanent)

### D32. User-data tables use service-role-only writes; no anon-key write policies
- **Conflict (surfaced during PR4 verification):** PR4's approved scope
  for `public.profiles` included an own-row UPDATE policy with `WITH
  CHECK` pinning privileged columns. Implementation shipped without
  any self-UPDATE policy, deviating from approved scope. The deviation
  was driven by the F2 lesson from PR2.8: `users.UPDATE` originally
  shipped as `USING (auth.uid() = id)` with no `WITH CHECK`, which
  permitted any logged-in user to PATCH `is_admin = true` and bypass
  payment. F2's resolution dropped the self-UPDATE policy entirely
  and routed all profile writes through Server Actions on the service
  role. Replicating that pattern on `profiles` from day one is safer
  than re-introducing a `WITH CHECK`-pinned column list that rots as
  schemas evolve.
- **Resolution:** **User-data tables use service-role-only writes; no
  anon-key write policies.** Both `public.users` (post-PR2.8 F2) and
  `public.profiles` (PR4) ship without authenticated INSERT or UPDATE
  policies. All writes route through Server Actions running with the
  service role. **This is the permanent pattern for any future user-data
  table; do not add own-row UPDATE policies even with `WITH CHECK`
  clauses.**
- **Rationale:** F2 surfaced that `WITH CHECK`-pinned column lists rot
  as schemas evolve. Every privileged column has to be remembered in
  the `WITH CHECK` clause; adding a new privileged column later without
  updating the policy is the next privilege-escalation hole. Service-
  role-only writes invert the default — clients cannot write at all,
  server code explicitly chooses what to write. Adding columns later
  doesn't introduce risk. The cost is one Server Action per write
  path; the benefit is a permanently closed escalation surface.
- **Consequence for code:** Every Server Action that writes to user-data
  tables must use the service-role client (`getSupabaseAdmin()` /
  `createServerClient()`), not the user-context client. Any code path
  that needs to write to these tables from the user's request context
  routes through a Server Action; the request never touches the table
  directly.
- **Process note:** The PR4 deviation produced the better result, but
  the process was off — the dev decided inside execution rather than
  surfacing the contradiction with approved scope first. Reinforced
  going forward: scope conflict found → stop and surface → wait for
  approval → execute. Not "deviate-and-surface-in-verification."

-----

## 2026-04-30 — PR1.6 broad-scope SKU surface deletion

### D27. PR1.6 expanded from narrow (config.pricing only) to broad (full SKU surface)
- **Conflict:** PR1.6 was originally scoped as "delete `attorney_report` /
  `agent_plan` from `config.pricing`, delete `src/app/api/subscription/*`,
  drop unused subscription columns." On execution, the dev's pre-deletion
  audit surfaced that the narrow scope would leave four orphaned columns
  (`agent_name`, `brokerage`, `stripe_subscription_id`, `subscription_status`)
  on `public.users` plus `lookups.report_type` (001) and
  `reports.matter_reference` (006), with branch logic in
  `checkout/create/route.ts:102-106` and `webhooks/stripe/route.ts:199-253`
  that handles 'standard' and 'attorney' paths but where only one ever fires.
  Half-cleaned SKU code is worse than uncleaned — the orphans become future
  "what is this for?" questions and nuisance fixes that re-litigate D19/D20.
- **Resolution:** Expanded PR1.6 to **A2 + B** (broad). Single PR rips out the
  entire dead subscription/attorney surface:
  - All four 008 columns: `stripe_subscription_id`, `subscription_status`,
    `agent_name`, `brokerage`.
  - `lookups.report_type` (001).
  - `reports.matter_reference` (006).
  - `attorneyReport` and `agentPlan` from `src/lib/config.ts`.
  - `src/app/api/subscription/*` (whole directory).
  - `src/app/api/lookup/[id]/report-type/` (whole directory — its only purpose
    was to toggle the SKU).
  - `src/app/subscribe/page.tsx` (whole route).
  - `src/lib/subscription.ts` (`hasAgentAccess`, `getSubscriptionMessage`,
    `getSubscriptionCTA` are dead).
  - `OnboardingModal` step 2 (name + brokerage fields) — collapsed to a
    single-step modal (role + volume only).
  - Dashboard subscription/profile UI block + report_type column display.
  - PDF brokerage line + entire attorney cover page block in `src/lib/pdf.ts`.
  - `report_type` branch logic in `checkout/create/route.ts` and
    `webhooks/stripe/route.ts`; subscription event handlers in
    `webhooks/stripe/route.ts`; agent branding fetch + attorney-specific
    PDF storage path branch in `report/[id]/download/route.ts`.
  - Stripe metadata fields `report_type` + `matter_reference` from
    `lib/stripe.ts::createCheckoutSession`; the function signature also
    drops the `reportType` and `matterReference` parameters.
  - `lookupInitiateSchema.report_type` enum field from `lib/schemas.ts`.
  - `LookupInitiateRequest.report_type` from `src/types/index.ts`.
  - `reportType` parameter from `sendReportEmail` and the corresponding
    "Report type" row in the email HTML.
  - README references to "litigation-grade attorney reports", "$199
    attorney-grade reports", and the `report_type` / `matter_reference`
    column descriptions.
- **Rationale:** Half-cleaned SKU code is worse than uncleaned. Cleanest
  moment for the cascade is now — zero paying customers, no live
  attorney reports, no active agent-subscribers. Every week PermitCheck
  has real users is a week the cascade gets harder.
- **Pre-flight audit (read-only via MCP, 2026-04-30):**
  - All six dropped columns were NULL on every row in prod (verified via
    `SELECT COUNT(*) WHERE <col> IS NOT NULL` per column — every count = 0).
  - `pg_depend` showed only auto-droppable dependents: `lookups_report_type_check`,
    `users_subscription_status_check`, `idx_users_subscription_status`.
    No FKs, triggers, or views.
  - The `'attorney'` enum value of `lookups.report_type` was never written
    to a row in prod — no historical signal lost by dropping the column.
- **Migration:** `018_drop_sku_columns.sql`. Idempotent (every `DROP COLUMN`
  uses `IF EXISTS`). Applied direct-to-prod via MCP `apply_migration` under
  the same expedited path established by D26 (no staging environment exists
  yet; CI label gate provides the human pause point). Ledger entry
  canonicalized from auto-generated timestamp to `'018'` matching the file
  name (same housekeeping pattern as 016/017).
- **Closes:** D19 (live pricing in code vs. MVP scope — `attorneyReport` and
  `agentPlan` deleted; D19 remains open only for the `singleLookup` $9.99
  vs. $29 pricing decision, which is independent of this PR). D20 (attorney
  report SKU undocumented — SKU now fully removed).
- **Build verification:** `npm run build` passes cleanly post-change. `npm
  run lint` shows no PR1.6-introduced errors (only pre-existing
  `no-html-link-for-pages` warnings unrelated to this work).

-----

## 2026-04-30 — PR2.8 RLS hardening expedited apply

### D26. 017 applied direct-to-prod via MCP under expedited path
- **Conflict:** PR2.8's standard apply path is "staging-first, then prod
  with `migration-approved` label." No staging Supabase project exists
  yet. F2 (the dropped self-UPDATE policy on `public.users`) is a
  **currently-exploitable privilege escalation** — any logged-in user
  could `PATCH /users?id=eq.<self>` with `{is_admin: true}` and get free
  reports forever (the `is_admin` flag bypasses payment per migration
  014). Waiting for staging delays a real fix.
- **Resolution:** `017_rls_hardening.sql` applied direct-to-prod via the
  MCP `apply_migration` tool, same expedited path as PR2.7. Justification:
  (a) F2 is exploitable now; (b) staging environment does not yet exist;
  (c) the CI `migration-approved` label gate provides the human pause
  point that staging would have. Migration is fully idempotent (every
  CREATE POLICY preceded by DROP POLICY IF EXISTS; ALTER TABLE ENABLE
  RLS is a no-op on already-enabled tables; COMMENT ON TABLE is
  unconditional). The pattern is **expedited, not standard** — once a
  staging project exists, all schema migrations route through it before
  prod, no exceptions.

- **Pre-customer phase clarification (added 2026-04-30 with PR4):**
  PermitCheck has zero paying customers as of PR4. The production database
  is functionally staging — no live customer data exists, no revenue is
  at risk from a bad migration, and the cost of provisioning a second
  Supabase project exceeds the bounded risk of a recoverable migration
  error during this phase. The expedited path (CI `migration-approved`
  label + idempotent migration + pre-flight `pg_depend` audit + post-apply
  verification) **remains the migration workflow until first paying
  customer.** This is not drift from D26's original framing — it is the
  deliberate sequencing for the pre-customer window.

  **Trigger to retire:** when the first $29 transaction settles in
  production from a non-Cameron Stripe account, the expedited path is
  permanently closed. The next migration after that event routes through
  a staging environment (provisioned at that point). No exceptions, no
  "one more expedited" — first paying customer is the hard cutoff.

  **Operational implications:**
  - Anyone reviewing this build six months from now sees the expedited
    path as a deliberate choice, not drift.
  - The retirement trigger is observable (Stripe dashboard) and unambiguous.
  - **PR5 (Stripe webhook handoff) acceptance now includes:** "first
    non-Cameron $29 transaction triggers staging provisioning before any
    subsequent migration."

- **Scope reduction:** Item 5 of the originally-planned PR2.8 (service-role
  INSERT policy on `public.profiles`) was **stripped from 017** and
  deferred to PR4. Reason: project rule that policies live in the same
  migration as the table they govern. The `public.profiles` table is
  scheduled for creation in PR4, and its INSERT policy lands there.

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

### D19. Live pricing in code vs. MVP scope (RESOLVED 2026-04-30)
- **Conflict:** `src/lib/config.ts:20–25` ships `singleLookup: 999` ($9.99),
  `attorneyReport: 19900` ($199), `buyerPlan: 2900` ($29/mo), `agentPlan: 9900`
  ($99/mo). D8 ruled MVP at "$29 one-time only" and deferred the $99/mo
  subscription to v1.1. Three of four live SKUs disagree with D8. Affected
  surface: `migrations/001_initial_schema.sql:27` (`report_type` column),
  `migrations/008_agent_subscription.sql`, `src/app/api/subscription/*`,
  `README.md:24`.
- **Resolution:** $29 one-time confirmed as MVP price. The $9.99 figure was
  legacy lookup-product pricing carried forward from a pre-MVP iteration —
  not a discount on the diligence report. PR1.6 already removed
  `attorneyReport` and `agentPlan` (option-a partial). This entry now closes
  the remaining `singleLookup` thread: `config.pricing.singleLookup`
  flipped from `999` to `2900` cents in a chore: PR; the four hardcoded
  `$9.99` UI strings (`page.tsx` ×2, `results/[id]/page.tsx` ×1, `README.md`
  ×1) updated to `$29` to match. `buyerPlan: 2900` stays as a placeholder
  for the v1.1 subscription that D8 deferred — it isn't wired to any code
  path today, but isn't actively misleading either; revisit when v1.1 lands.
  Stripe Checkout will display `$29.00` on the next test-mode payment;
  existing `reports.stripe_payment_intent_id` rows are unaffected (already
  settled). No production data affected.

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
