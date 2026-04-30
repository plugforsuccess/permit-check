# PermitCheck MVP — PR Roadmap

Living document tracking every PR in the MVP build, in execution order. Each entry includes scope, acceptance criteria, dependencies, and risk level.

**Status legend:** ✅ merged · 🟡 in review · 🔵 ready to start · ⏸ blocked · ⚪ not started

**Risk legend:** 🟢 low (docs, hygiene, scaffold) · 🟡 medium (schema, infra) · 🔴 high (auth, payments, prod data)

Last updated: April 2026.

---

## Foundation phase (Week 1–2)

### PR1 — Engineering contract + product spec ✅

**Status:** Merged. **Risk:** 🟢

**Scope:** Replace the placeholder `CLAUDE.md` with the operating manual. Convert the docx spec to `docs/SPEC.md`. Add `docs/DECISIONS.md` capturing resolutions to the original audit's contradiction list.

**Why it matters:** Without an engineering contract, every Claude Code prompt drifts. The merge gate, the agent boundary rule, and the autonomy boundaries all live here.

**Acceptance:** `git ls-files | grep -E "CLAUDE.md|docs/(SPEC|DECISIONS).md"` returns three files. Old `AGENTS.md` and original short `CLAUDE.md` removed. Zero application code changed.

---

### PR1.5 — Merge split docs into single files ✅

**Status:** Merged. **Risk:** 🟢

**Scope:** Combine `CLAUDE.md` + `CLAUDE-deep.md` into one root file with Part I / Part II structure. Combine `SPEC.md` + `SPEC-deep.md` into one file with the same structure. Update internal cross-references.

**Why it matters:** Reduces per-turn context cost. Simplifies the doc tree from four files to two.

**Acceptance:** `/CLAUDE.md` and `/docs/SPEC.md` are single merged files. `grep -rn 'CLAUDE-deep\|SPEC-deep' .` returns zero matches.

---

### PR2.5 — RLS audit ✅

**Status:** Merged (`bd6dd2c`). **Risk:** 🟢

**Scope:** Read `supabase/migrations/010_fix_rls_policies.sql` end-to-end. Document effective policies on every user-data table. Output `/docs/RLS_AUDIT.md` classifying each policy ✅ correct / ⚠️ permissive but intentional / ❌ needs fix. Audit only — no migration code.

**Findings:**
- **F1:** Migration 010 dropped the service-role policy on `reports` and didn't recreate it. Runtime behavior unchanged (service role bypasses RLS), but `pg_policies` introspection shows a hole.
- **F2:** `users.UPDATE` policy allows authenticated users to self-promote to `is_admin = true`. Privilege escalation vector.
- **F3:** `summary_feedback` has RLS enabled with no policies. Intentional per migration 010 comment but undocumented at the table level.

**Why it matters:** Proves user data isolation is actually enforced before paying customers exist. Required for SPEC §7 compliance line.

**Acceptance:** `/docs/RLS_AUDIT.md` exists, every user-data table accounted for, three findings documented, scope for `017_rls_hardening.sql` proposed but not written.

---

### PR2.6 — Migration ledger audit ✅

**Status:** Merged (`bd6dd2c`). **Risk:** 🟢

**Scope:** Probe live prod DB. Compare `supabase_migrations.schema_migrations` to actual schema state. Output `/docs/MIGRATION_LEDGER_AUDIT.md` with forensic reconstruction, replay-safety matrix per migration, backfill plan. Add D25 to `docs/DECISIONS.md`.

**Findings:**
- Ledger records 001/002/003. Live schema reflects all 15 migrations. Migrations 004–015 applied via mixed paths (dashboard SQL editor, direct psql).
- Migrations 009 and 010 flagged as unsafe-as-written for replay.
- Two undocumented anomaly objects exist in prod schema with no source migration.

**Why it matters:** Without ledger reconciliation, future `supabase db push` against prod has undefined behavior. Blocks PR4 (parallel-tables schema) absolutely. The single highest-leverage finding in the entire build.

**Acceptance:** `/docs/MIGRATION_LEDGER_AUDIT.md` exists, `docs/DECISIONS.md` D25 records the finding and guardrail, SPEC.md §12 build plan updated to insert PR2.7.

---

### PR2.7 — Migration ledger backfill ⏸

**Status:** Blocked on staging environment. **Risk:** 🔴

**Scope:** Create `016_ledger_backfill.sql` recording 004–015 in `supabase_migrations.schema_migrations` (option A from the audit). Resolve the two undocumented anomaly objects — DROP if accidental, `CREATE OR REPLACE` in an authoritative migration if intentional.

**Blocker:** No staging Supabase project exists. The migration is too high-risk to apply directly to prod without staging verification per D25.

**Path forward:** Provision `permitcheck-staging` Supabase project. Apply 001–015 via CLI. Verify ledger ends with all 15 entries. Apply 016 to staging, verify `supabase db diff` returns zero changes against repo, then apply to prod via dashboard with SQL reviewed line-by-line.

**Acceptance:**
- `016_ledger_backfill.sql` written and reviewed
- Staging ledger matches repo after 016 applied
- `npm run db:diff:staging` returns zero changes
- Prod ledger matches repo after dashboard application
- CI guardrail blocking `supabase db push` against prod relaxes to "requires Cameron approval label"

---

### PR2.8 — RLS hardening migration ⏸

**Status:** Blocked on PR2.7. **Risk:** 🔴

**Scope:** Create `017_rls_hardening.sql` with all five items from `RLS_AUDIT.md` §H:

1. Recreate dropped service-role policy on `reports` (F1)
2. F2 — drop self-UPDATE on `users` per option (a). Conditional on grep showing no client-side `users` writes:
   - `grep -rn "from('users')" src/ | grep -v "service" | grep -iE "update|insert|upsert"`
   - `grep -rn "supabase.from.*users" src/components/ src/app/`
   - `grep -rn "createBrowserClient" src/ -A 30 | grep -iE "from.*users.*update"`
   - If any legitimate client write exists, fall back to option (b) with `WITH CHECK` enumerating `is_admin`, `stripe_customer_id`, `subscription_tier`, `created_at`
3. F3 — `COMMENT ON TABLE summary_feedback` documenting intentional no-policy state. Idempotent `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
4. INSERT policy on `users` for service role only (forward-looks PR8 magic-link).
5. INSERT policy on `profiles` for service role only.

**Why it matters:** Closes the privilege escalation in F2 before any paid customer exists. Sets up auth tables for PR8 magic-link migration.

**Acceptance:** Same staging verification flow as PR2.7. All five items applied. RLS audit re-run shows zero ❌ findings.

---

### PR1.6 — Pricing SKU cleanup ⚪

**Status:** Not started. **Risk:** 🟡

**Scope:** Delete `attorney_report` and `agent_plan` from `src/lib/config.ts`. Delete `src/app/api/subscription/*`. Drop unused subscription columns via new migration (do not edit 001 or 008 — drop in a new sequentially-numbered migration). Update `README.md`.

**Why it matters:** $29-only is the MVP scope per DECISIONS. Dead pricing code will mislead the dev and pollute Stripe webhook logic.

**Acceptance:**
- `attorney_report` and `agent_plan` not present in `config.pricing`
- `src/app/api/subscription/` directory removed
- New migration drops unused columns
- README pricing section reflects $29-only

**Note:** Can run in parallel with PR2 once PR2.7 + PR2.8 land.

---

### PR2 — Validated env + import discipline + PII redaction + Axiom ⚪

**Status:** Blocked on PR2.7 + PR2.8. **Risk:** 🟡

**Scope:**
- Rewrite `src/lib/env.ts` as single Zod schema parsed at module load. Export typed `env` object.
- Replace every `process.env.X` in app code with `env.X` import. Audit found callsites at `src/lib/summary.ts:429`, `src/lib/supabase/server.ts:11–12`, `src/lib/supabase/client.ts:8–9`, plus any others grep finds.
- Update `.env.example` to match schema. Include `ANTHROPIC_MODEL_ORCHESTRATOR=claude-sonnet-4-5`, `ANTHROPIC_MODEL_REPORTER=claude-opus-4-7`, `INNGEST_*`, `EMAIL_FROM`, feature flags from SPEC §15.
- Add PII redaction to `src/lib/logger.ts` — strip addresses to ZIP+street-name at info level, full address only at debug level gated by `LOG_FULL_ADDRESS=true`.
- Remove 9 `console.log` calls in `src/lib/accela/scraper.ts` and 1 in `src/lib/summary.ts:278`.
- Add Axiom transport to logger (Sentry deferred to PR8).

**Why it matters:** Foundation for everything else. Without typed env, downstream tools (Anthropic SDK, Stripe, Inngest) won't connect reliably. Logging discipline is required for compliance.

**Acceptance:**
- `grep -rn 'process\.env\.' src/` returns zero matches outside `src/lib/env.ts`
- `grep -rn 'console\.log' src/` returns zero matches in committed app code
- Server fails fast on missing env var with one readable error
- Logger produces redacted output at info level, full output at debug level when flag is on
- Axiom receives structured JSON for logged events

---

## Agent foundation phase (Week 2–3)

### PR3 — Inngest + Anthropic SDK scaffold ⚪

**Status:** Blocked on PR2. **Risk:** 🟢

**Scope:**
- Add `inngest` and `@anthropic-ai/sdk` deps. No LangChain, no LangGraph, no MCP.
- Create `src/lib/agent/{orchestrator.ts, prompts/, tools/, schemas.ts}` and `src/inngest/`.
- One no-op `report.requested` handler that writes a `report_events` row and returns.
- Wire against Inngest free-tier assumptions (24h retention, lower concurrency). Document upgrade-to-Pro decision in DECISIONS.md as calendar trigger.

**Why it matters:** Reports must run in the background. The current Stripe webhook anti-pattern (running reports inline with a 20s self-imposed budget) cannot hit the 90s p95 target.

**Acceptance:**
- Dispatching a fake `report.requested` event end-to-end via local Inngest dev server writes one event row and completes
- ESLint clean
- No LangChain / LangGraph / MCP in `package.json`
- Type-safe Anthropic SDK wrapper exists in `src/lib/agent/schemas.ts`

---

### PR4 — Per-property cache schema ⏸

**Status:** Blocked on PR2.7 (ledger reconciliation must complete first). **Risk:** 🔴

**Scope:** New migration adding `properties`, `permits_v2(property_id)`, `report_events`, `reports_v2` (with `report_json`, `llm_cost_usd`, `duration_seconds`, `stripe_payment_intent_id UNIQUE`). RLS policies in same migration. Indexes in same migration. Legacy `lookups`/`permits` stay alive — non-destructive.

**Why it matters:** The unit economics ($2/report cost ceiling) require shared caching across users. Per-search cache (current model) doesn't scale.

**Acceptance:**
- Staging verification per PR2.7 protocol
- `supabase db reset` runs clean on staging
- RLS deny-by-default verified by test
- Old code still works against legacy tables
- Prod ledger matches repo after dashboard application

---

### PR5 — Stripe webhook → Inngest handoff ⏸

**Status:** Blocked on PR4. **Risk:** 🔴

**Scope:** Modify `src/app/api/webhooks/stripe/route.ts` so successful `checkout.session.completed` writes a `reports_v2` row in `pending`, emits an Inngest event, returns 200. Gated behind `USE_INNGEST_REPORTS` env flag. Don't delete legacy inline path — feature-flag the new path.

**Operational rule (amended per D33):** PR5 ships the plumbing with `USE_INNGEST_REPORTS=false` as the default. The flag flips to `true` in staging the same day **PR6** (deterministic steps) lands, and to prod within 48h of staging verification. This is a deviation from the originally-specified "same-day staging flip after PR5 merge" rule — the agent loop being stubbed in PR3 means flipping the flag in PR5 produces no useful signal, only failed reports. The flip ceremony moves to PR6 where it actually exercises something. See DECISIONS.md D33.

**Why it matters:** Connects "user paid" to "agent runs." Today, payments don't trigger background work — they trigger 20-second inline runs that violate the spec.

**Acceptance:**
- Paying $29 in staging with `USE_INNGEST_REPORTS=true` (post-PR6) lands a `reports_v2` row in `pending`
- Inngest event logged
- Webhook returns under 1s
- Legacy path unchanged when flag is off
- Anonymous payments (`lookups.user_id IS NULL`) route to legacy path even when flag is on (D34 branch)
- `intent` field populated on every event via `DEFAULT_REPORT_INTENT="flip"` constant (D35)
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` flipped from `.optional()` to `.string().min(1)` in `env.ts`; both verified set in Vercel before merge
- D26 pre-customer cutoff: first non-Cameron $29 transaction triggers staging provisioning before any subsequent migration

---

### PR6 — Steps 1+2 deterministic (normalize + parcel) ⚪

**Status:** Blocked on PR3 + PR4. **Risk:** 🟢

**Scope:** Implement `lib/agent/steps/normalize.ts` (Google Places — Text Search via `GOOGLE_MAPS_SERVER_KEY`) and `lib/agent/steps/parcel.ts` (existing scraper output). Pure Node.js. Zod-typed at boundaries. Both write `report_events`. Wire into Inngest handler from PR5. No LLM yet.

**Why it matters:** First two deterministic agent steps. The input that the LLM steps will consume.

**Acceptance:**
- Feeding a known Atlanta address through Inngest handler produces a `properties` row with `parcel_id` populated
- Four `report_events` rows logged: `normalize_started`, `normalize_completed`, `parcel_started`, `parcel_completed`
- Type-safe end-to-end
- **Same-day staging flip of `USE_INNGEST_REPORTS=true` after merge; prod flip within 48h.** The flip ceremony that was originally tied to PR5 lands here per D33 — PR6 is where the deterministic steps actually execute, so this is the first PR where flipping the flag produces a useful signal instead of stub-throw failures.

---

### PR7 — Eval harness + Greenwich fixture ⚪

**Status:** Blocked on PR6 and on Cameron authoring the Greenwich fixture. **Risk:** 🟢

**Scope:**
- Create `/evals/golden-set/`, `/evals/run-golden-set.ts`, `/evals/evaluator.ts`
- Cameron authors Greenwich St SW fixture #1 from litigation knowledge (CANNOT be delegated)
- Wire `npm run eval` into `package.json`
- Initial harness runs deterministic-only path from PR6, asserts parcel resolution is correct
- CI workflow runs eval on every PR touching `lib/agent/**` or `lib/scraping/**`

**Why it matters:** The merge gate. Eval thresholds (≥90% recall, 0 hallucinations, ≤120s p95, ≤$2/report) become enforceable from this PR forward.

**Acceptance:**
- `npm run eval` exits 0 against Greenwich fixture on main
- CI runs eval on every relevant PR
- Greenwich fixture documents expected red flags from active litigation

---

## Product phase (Week 3–5)

### PR9–PR12 (estimated) — Agent loop steps 3–8 ⚪

**Status:** Not yet scoped in detail. **Risk:** 🟡

**Scope (preview):**
- Step 3: Planning prompt (Sonnet 4.5)
- Step 4: Parallel tool calls (search_permits, get_property_records, get_contractor_record, get_code_violations, compare_footprint_to_permits, get_permit_document)
- Step 5: Analysis prompt (Sonnet 4.5)
- Step 6: Depth decision (max 2 extra calls)
- Step 7: Report generation (Opus 4.7)
- Step 8: Persistence + delivery (PDF + email)

Each step is its own PR. Each PR includes eval results showing thresholds maintained.

**Why it matters:** This is where the LLM work lives. Steps 1–2 are plumbing; this is the product.

**Acceptance per step:**
- Eval thresholds maintained
- Step latency budget respected (see SPEC §10)
- All claims traceable to `evidence_refs`
- Prompt file lives in `lib/agent/prompts/`
- System prompts cached via Anthropic SDK prompt caching

---

### PR13–PR14 (estimated) — Report UI + PDF + email + status page ⚪

**Status:** Not yet scoped in detail. **Risk:** 🟡

**Scope (preview):**
- Report display Server Component
- Playwright + `@sparticuz/chromium-min` PDF generation in serverless
- Resend email integration with PDF attachment
- Status page with Supabase Realtime subscription
- Landing page, pricing page, FAQ

**Why it matters:** Customer-visible delivery. The 90 seconds the user spends watching the status page is part of the product.

---

## Launch phase (Week 5–6)

### PR15 (estimated) — Admin review dashboard ⚪

**Scope:** `/admin/review` dashboard for first-100-reports gate. `pending_review` status enforcement. `AUTO_DELIVER_REPORTS` flag.

**Why it matters:** Spec §6 commitment. Friction is the feature for the first 100 reports.

---

### PR8 — Sentry + magic-link auth migration ⚪

**Status:** Blocked on PR2.8 + PR4. **Risk:** 🔴

**Scope:**
- Sentry SDK integration with Next.js wrapper
- Source map upload config
- Migrate from password auth to Supabase magic-link
- Update `/login` and `/signup` flows
- Status page copy updates for magic-link confirmation
- Remove `show-password toggle` (eacd9ef) and password reset flow

**Why it matters:** Magic-link is the friction reduction the spec committed to (§5). Sentry is required for SPEC §7 launch criteria.

**Acceptance:**
- Sentry receiving errors in staging and prod
- Magic-link auth working end-to-end
- Old password auth code removed
- Existing accounts migrate to magic-link on next login

---

### PR16 (estimated) — Soft launch hardening ⚪

**Scope:** Whatever issues surface from soft launch with 5 users from Cameron's network. Likely: rate limiting tuning, scraping reliability, prompt iteration based on real reports.

**Why it matters:** The thing that turns a "works on Greenwich" product into a "works on any Atlanta property" product.

---

## Reference

### Dependency graph

```
PR1 (docs) ✅
   │
   ├── PR1.5 (merge docs) ✅
   │
   ├── PR2.5 (RLS audit) ✅
   │      │
   │      └── PR2.8 (017 hardening) ⏸
   │
   ├── PR2.6 (ledger audit) ✅
   │      │
   │      └── PR2.7 (016 backfill) ⏸ ── blocks PR4
   │
   ├── PR1.6 (SKU cleanup) ⚪
   │
   └── PR2 (env + logger) ⚪ ── blocks PR3
          │
          └── PR3 (Inngest scaffold) ⚪
                 │
                 ├── PR4 (schema) ⏸
                 │      │
                 │      └── PR5 (webhook handoff) ⏸
                 │             │
                 │             └── PR6 (steps 1+2) ⚪
                 │                    │
                 │                    └── PR7 (eval harness) ⚪
                 │                           │
                 │                           └── PR9+ (LLM steps) ⚪
                 │
                 └── PR8 (Sentry + magic-link) ⚪
```

### What blocks what

- **PR2.7 blocks PR4 absolutely** — no schema changes via CLI until ledger reconciled
- **PR4 blocks PR5, PR6** — new tables don't exist yet
- **PR6 blocks PR7** — nothing to evaluate
- **PR7 blocks PR9+** — eval merge gate must exist before LLM work
- **PR2.5 + PR2.6 audits done; remediations (PR2.7, PR2.8) blocked on staging environment**

### The North Star

Cameron pays $29, types "1278 Greenwich St SW," waits 90 seconds, reads a report that correctly identifies every issue from the active litigation. Alan watches over his shoulder and says "this is real."

Every PR in this document either moves toward that moment or removes a blocker that would prevent it. If a PR's purpose isn't traceable to that moment, push back on it.

---

*Owner: Cameron Wiley. Updated as PRs land. If a PR's status here disagrees with reality, reality wins — fix the doc in a `docs:` PR.*
