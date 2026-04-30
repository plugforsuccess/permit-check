# PR9 Scope — Analysis Prompt + System Attestation Data Model

**Status:** Scope locked. Implementation deferred until PR3, PR4, PR5, PR6, PR7 land.

**Owner:** Cameron Wiley.

**Last updated:** April 2026.

This document captures the scope for PR9 (the analysis prompt — Step 5 of the agent loop) before the work starts, so that the data model decisions get made deliberately rather than reactively. The shape of the structured output PR9 produces affects every PR after it. Getting this wrong is expensive; getting this right is one extra paragraph in the prompt and a handful of extra fields in the output schema.

The strategic context for this PR lives in DECISIONS.md D29 (carrier dynamic-risk-pricing as long-term product) and D30 (buyer's-agent channel as middle-of-funnel scaling). PR9 is where both frames translate from strategy into code. The investor product ships first, but the analytical layer PR9 builds is consumed by three downstream products with three different framings — see the "Multi-audience reuse pattern" section below.

---

## What PR9 builds

The analysis step. Sonnet 4.5 receives the property facts and gathered data from PR4-PR8, runs the core analytical pass, and produces a structured analysis JSON consumed by PR10 (report generation, Opus). This is the most product-defining LLM call in the system — the analysis is the part of the report customers pay for.

Concretely, PR9 ships:

1. The system prompt for Step 5, in `src/lib/agent/prompts/analyze.ts`
2. The Zod schema for the analysis output, in `src/lib/agent/schemas.ts`
3. The orchestrator wiring in `src/lib/agent/steps/analyze.ts`
4. Eval cases in `/evals/golden-set/` exercising the new schema fields
5. Updated SPEC.md §10 Step 5 to match what shipped

PR9 does not ship the report generation prompt. That's PR10. PR9's output is structured JSON consumed by PR10; the customer-facing prose is PR10's job.

---

## The data model decision PR9 locks in

The analysis output structure described in SPEC.md §10 Step 5 is correct as-is for the investor product. But it's missing two fields that matter for the carrier product, and they're cheap to add now and expensive to retrofit later.

### Required additions to the analysis schema

**Every permit reference in the structured output must include `system_category` and `attestation_status` fields.**

```typescript
{
  permit_id: string,
  system_category: "roof" | "electrical" | "plumbing" | "hvac"
                 | "structural" | "addition" | "general"
                 | "demolition" | "other",
  attestation_status: "finaled"           // permit issued, work done, inspection passed
                    | "issued_open"       // permit issued, work in progress or unfinaled
                    | "expired_unfinaled" // permit expired without final inspection
                    | "void"              // permit voided or withdrawn
                    | "incomplete_data",  // status unclear from source data
  // existing fields...
}
```

Two new aggregates also added to the analysis output, derived from the per-permit fields above:

```typescript
{
  // existing analysis fields...

  system_attestation_profile: {
    roof: { last_attested_year: number | null, attestation_status: string },
    electrical: { last_attested_year: number | null, attestation_status: string },
    plumbing: { last_attested_year: number | null, attestation_status: string },
    hvac: { last_attested_year: number | null, attestation_status: string },
    structural: { last_attested_year: number | null, attestation_status: string }
  },

  unattested_systems: string[]
    // list of major systems with no permit history at all
    // e.g., a 1973 home with no plumbing permit on record
    // means plumbing is "unattested" — could be original, could be
    // replaced without a permit, the data layer can't tell
}
```

### Why these fields, why now

The investor product (PR10's report) probably won't surface `system_attestation_profile` directly. The investor wants to read "you have 3 critical red flags that could kill this deal," not "your plumbing was last attested in 2008." That's fine — the field exists in the structured output but the report generation prompt chooses what to render.

Two other downstream products will surface this data, framed differently:

- **The buyer's-agent product (post-MVP, D30):** repackages the same analysis with agent-workflow framing. A one-page client-facing summary, an agent-only section with negotiation-relevant findings, white-label option for brokerages. The agent SKU is monthly subscription, not per-report. The `system_attestation_profile` becomes a key talking point — "your client should know this house's plumbing was last attested in 2008" is exactly the kind of factual, defensible statement an agent can share with a buyer without overstepping.
- **The carrier product (post-MVP, D29):** dynamic risk pricing for insurance carriers. Reduces to: for each major system, what's the attested age, and is the attestation valid? A property's risk class changes meaningfully when you know that a 1973 home has 5-year-old attested plumbing vs. when you only know it was built in 1973.

If PR9 ships without these fields, all downstream products require:
- A data backfill pass over every report ever generated
- Re-running the analysis step on cached data to extract the structured signal
- Or worse, re-querying the permit data for every cached property

If PR9 ships with these fields, all downstream products require:
- A new report generation prompt (PR10-equivalent) that surfaces the existing fields differently
- That's it

The cost differential is approximately one prompt-engineering iteration per downstream product vs. months of data work per downstream product.

### The "paid invoice ≠ permitted work" framing

The analysis prompt should explicitly distinguish between *seller representations* (paid invoices, contractor quotes, listing language about "updated systems") and *permit attestation* (a permit was pulled, work was inspected, inspection passed).

A 2019 paid invoice for "new piping throughout" with no corresponding permit is a major finding for three reasons:
1. **Investor reason:** the work was likely done by an unlicensed person or done in a way that wouldn't pass inspection. Higher probability of failure post-closing.
2. **Buyer's-agent reason:** the agent's client is making an offer based on a representation that isn't third-party-verified. The agent has a duty to flag this before the offer goes out, both for the client's protection and for the agent's own liability protection.
3. **Carrier reason:** the system age claim is unverifiable. The piping might be 5 years old or 50 — no third-party attestation exists.

All three reasons matter. Each downstream product leads with the reason most relevant to its audience: investor report leads with reason 1, agent report leads with reason 2, carrier product leads with reason 3. PR9's analysis surfaces all three findings as a single structured signal; downstream prompts choose framing.

---

## Analysis prompt requirements

The full analysis prompt skeleton in SPEC.md §10 Step 5 stays. The additions for PR9:

**1. System categorization.** When emitting any permit reference (in `red_flags.evidence_refs`, `permit_timeline`, `unpermitted_work_assessment.evidence_refs`, anywhere), tag it with `system_category` from the enum above. The model should categorize based on `permit_type` and `work_description` from the source data.

**2. Attestation status reasoning.** The model categorizes each permit's `attestation_status` based on `status` and `finaled_date` from source data:
- `finaled` → finaled with non-null `finaled_date`
- `issued_open` → status='issued', no `finaled_date`, within expiration window
- `expired_unfinaled` → status='expired' OR past expiration with no `finaled_date`
- `void` → status='void' or 'withdrawn'
- `incomplete_data` → status field missing or ambiguous

The Zod schema enforces these values. The prompt explains them.

**3. System attestation profile aggregation.** After categorizing all permits, the model produces a profile with the most-recent-attested-year per system. "Most recent" means the most recent `finaled` permit; `issued_open` and `expired_unfinaled` permits don't count toward attestation.

**4. Unattested systems list.** Major systems with zero `finaled` permits in the property's history. Property age matters here — a 2023 home has no permit history yet because the original construction permit covers everything. The prompt should not flag systems as "unattested" on properties built within the last 5 years; for older properties, missing system permits get flagged.

**5. Seller representation handling.** If the input data includes seller representations (listing description, disclosure forms — note: NOT in MVP scope but the prompt should be ready for it), surface any conflict between representation and attestation as a finding. Example: "Listing claims new roof in 2018; no roof permit on record for that year. The roof may have been replaced without a permit (lower quality risk + unverifiable age) or the claim may be inaccurate."

For MVP, this section of the prompt is dormant — the agent has no seller representation input — but the prompt structure is ready for when PR16+ adds it.

**6. Hard constraints (unchanged from SPEC.md §10):**
- Every claim has populated `evidence_refs`
- No legal conclusions (D-rule from CLAUDE.md)
- "Incomplete data" is a valid finding; guessing is not
- Insurance implications stay in the structured output (`why_it_matters` field), framing decisions are PR10's

---

## Eval requirements

The Greenwich St SW fixture (golden set #1) needs to test:

1. The new schema fields are populated correctly (`system_category`, `attestation_status`, `system_attestation_profile`, `unattested_systems`)
2. Every permit gets categorized — no `null` `system_category` values except where the source data legitimately can't be classified
3. Attestation status logic matches the rules above
4. The unattested-systems list correctly identifies plumbing/electrical/roof systems on the Greenwich property that lack `finaled` permits

Cameron's ground-truth fixture should explicitly include the expected `system_attestation_profile` for the Greenwich quadruplex. This is part of the fixture-authoring work that blocks PR7 — extending it for PR9 is one additional pass.

Beyond Greenwich, two synthetic fixtures should test edge cases:

- **Recent construction (2023+):** verifies the prompt doesn't false-positive on "unattested" for systems covered by the original construction permit
- **Older home with strong attestation history:** a 1965 home with full permit history showing system replacements in 2010, 2015, 2018, 2020 — verifies the profile aggregation correctly identifies the most-recent-attested-year per system

These two fixtures are net-new for PR9 and should be authored by the dev (not Cameron) since they're synthetic and don't require ground-truth knowledge from litigation.

---

## Multi-audience reuse pattern

PR9's analytical engine is consumed by three downstream products. Each product uses the same structured output and the same `system_attestation_profile`, but framed for a different audience by a different report-generation prompt at Step 7 (PR10 and its eventual siblings).

| Product | Audience | Pricing | Framing of the same finding | Status |
|---|---|---|---|---|
| **Investor report** | Real estate investors (flippers, BRRRR, buy-and-hold) | $29/report | Deal protection — "this could kill your returns" | MVP (PR10) |
| **Agent report** | Investor-focused buyer's agents, listing agents pre-clearing listings, agents in litigation-prone markets | $199–499/mo subscription with white-label | Client protection + liability protection — "here's what your client should know before making an offer" | Post-MVP (v1.1+) |
| **Carrier dataset** | Insurance carriers and agencies | Enterprise data licensing or per-quote fees | Risk pricing — "attested system age vs. static year-built" | Post-MVP (v2+) |

**The implementation rule that makes this work:** the analytical layer (Step 5, this PR) is audience-agnostic. The framing layer (Step 7, PR10+) is audience-specific. Don't bake "this is an investor report" assumptions into Step 5 prompts. The Step 5 output should read like an underwriter's structured assessment — facts, severity ratings, evidence references, system attestation profile — with no consumer-facing prose. PR10 then takes that structured assessment and writes investor-voice copy. A future PR-equivalent for agents takes the same structured assessment and writes agent-voice copy. Same engine, different mouth.

If PR9 violates this rule — if the analysis prompt produces investor-facing prose, or hardcodes investor-specific framing in `why_it_matters` fields — every downstream product requires re-running the analysis instead of just re-rendering the report. That's the failure mode this section exists to prevent.

The `why_it_matters` field on each red flag should be written as a structured assessment ("Unpermitted electrical work increases risk of denied claims under standard homeowners coverage; insurance binding may require additional inspection or be declined entirely"), not as audience-specific advice ("You should walk away from this deal" / "Tell your client to ask for a $5K credit at closing"). The framing language is PR10's job. The structured facts are PR9's job.

---

## What's explicitly out of scope for PR9

- **The investor report itself** (consumer-facing prose, layout, branding). That's PR10.
- **The buyer's-agent product** (different report format, different prompt, white-label, monthly subscription billing). This is post-MVP per D30. PR9 prepares the data; it does not ship the agent-facing deliverable.
- **The carrier product itself** (different report format, different prompt). This is post-MVP per D29. PR9 prepares the data; it does not ship the carrier-facing deliverable.
- **Multi-jurisdiction normalization of permit type vocabularies.** A "MEC" permit in DeKalb might map to "MECHANICAL" in Atlanta. PR9 handles whatever the existing scrapers produce; deeper normalization is a separate workstream.
- **Photo-based system attestation** (satellite roof imagery, etc.). Future product surface, not PR9.
- **Seller representation ingestion.** The prompt is structured to accept it but no input pipe exists for MVP.

---

## Acceptance criteria

- `src/lib/agent/prompts/analyze.ts` exports the prompt as a const string
- `src/lib/agent/schemas.ts` defines the analysis output Zod schema with all fields above
- `src/lib/agent/steps/analyze.ts` calls Sonnet via the orchestrator with prompt caching enabled, validates output via Zod, writes a `report_events` row, returns typed result
- Greenwich fixture eval shows the system attestation profile matches Cameron's ground truth
- Two synthetic fixtures (recent construction, strong attestation history) pass
- Eval thresholds maintained: ≥90% recall on critical red flags, 0 hallucinations, ≤120s p95, ≤$2/report
- SPEC.md §10 Step 5 updated to include the new fields
- The PR description includes a worked example: paste the structured output for the Greenwich property and walk through how the `system_attestation_profile` was derived from the underlying permit data
- **Audience-agnostic check:** the analysis output for any test fixture contains no consumer-facing imperative language ("you should…", "tell your client to…", "we recommend walking away"). All `why_it_matters` and `finding` fields are written as structured factual assessments. This is verified by a simple grep in CI: `grep -E "you should|tell your client|we recommend|walk away" /tmp/eval-output.json` returns zero matches across all fixture outputs.

---

## Dependencies (what must land before PR9 starts)

- **PR3** — Inngest + Anthropic SDK scaffold. PR9 needs the orchestrator to live in.
- **PR4** — Schema. PR9 writes to `report_events`; the analysis output lands in `reports_v2.report_json`.
- **PR5** — Webhook handoff. PR9 runs in the Inngest job triggered by Stripe.
- **PR6** — Steps 1+2 deterministic. PR9 receives normalized property data from these steps.
- **PR7** — Eval harness + Greenwich fixture. PR9 runs against the harness from day one; without it the merge gate doesn't exist.

PR9 cannot start until all five are merged.

---

## What this document is and isn't

This is a scope spec, not a kickoff prompt. When PR9's actual time comes — likely 2-3 weeks out — the dev reads this document, then reads the relevant SPEC.md sections, then opens the PR. The kickoff prompt at that time will be short:

> Proceeding with PR9. Read `/docs/PR9_SCOPE.md` and SPEC.md §10 Step 5. Confirm the prerequisite PRs (PR3 through PR7) are all merged. Propose the prompt structure before writing the full prompt — I want to review the prompt skeleton before you draft the implementation.

That's a 4-line prompt that points at this document. The work this document does is encode the scope decisions while they're fresh, so the kickoff doesn't need to re-litigate them.

---

*This document supersedes SPEC.md §10 Step 5 where they conflict. SPEC.md should be updated to match this document as part of PR9 (or in a `docs:` PR shortly before).*
