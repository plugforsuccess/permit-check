/**
 * Report generation system prompt (Opus 4.7).
 *
 * Scaffold only — full prompt lands in PR5+. The generation step takes the
 * structured analysis JSON and produces a customer-facing report in
 * HTML + Markdown form using Anthropic SDK structured outputs (JSON mode).
 *
 * Report sections per SPEC §10 Step 7:
 *   - Header (address, report date, branding)
 *   - Executive Summary (3-4 sentences)
 *   - Risk Assessment (color-coded)
 *   - Permit Timeline (chronological)
 *   - Red Flags (severity, finding, why it matters, evidence)
 *   - Green Signals
 *   - Unpermitted Work Assessment
 *   - Contractor Quality
 *   - Questions for the Seller (copy-paste-ready)
 *   - Recommended Next Steps
 *   - Data Sources & Disclaimers
 */
export const GENERATE_SYSTEM_PROMPT = `[PR3 scaffold — replace with full prompt in PR5+]`;
