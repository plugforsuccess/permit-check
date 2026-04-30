TASK: Wire PermitCheck → QuoteSync lead push (v1.1)

CONTEXT
- PermitCheck and QuoteSync are sister apps under the same agency
  ownership (Wiley-Wilson Insurance). Both run on Supabase.
- When a PermitCheck buyer opts into an insurance quote, we push a
  lead row into QuoteSync's `leads` table so the agency's reps see
  it in their Today queue.
- This is post-MVP work. Do not start until PermitCheck v1.0 ships.

BEFORE WRITING CODE — verify the contract on the QuoteSync side
1. Get read access to the QuoteSync Supabase project (ask Cameron
   for the project ref + a read-only Postgres role, or use the
   Supabase MCP server already wired into Claude Code).
2. Run information_schema queries against `public.leads` and confirm
   every column we plan to write actually exists with the type we
   expect. Don't trust documentation — verify the live schema.
3. Confirm these tables/enums:
   - `public.leads` (target table)
   - `public.lead_status` enum (valid `status` values)
   - `public.agency_routing_rules` (how leads get assigned)
4. Confirm whether `lead_source` (text) and `diligence_payload`
   (jsonb) columns exist. If they don't, the QuoteSync side needs
   to add them via migration BEFORE we ship — flag this and stop.
5. Confirm the agency_id we'll write under (Wiley-Wilson is
   '00000000-0000-0000-0000-000000000001', verify it matches prod).

WIRE PROTOCOL
- Endpoint: POST https://<quotesync-host>/api/leads/permitcheck
  (QuoteSync side will expose this as a Supabase Edge Function or
  Next.js API route — coordinate with the QuoteSync dev to confirm
  the actual URL).
- Auth: HMAC-SHA256 over the raw JSON body using a shared secret.
  Send signature in the `X-PermitCheck-Signature` header. The
  shared secret lives in Vercel env on both sides as
  PERMITCHECK_LEAD_WEBHOOK_SECRET. Generate via `openssl rand -hex 32`.
- Idempotency: include `idempotency_key = report_id` so retries
  don't double-insert. The QuoteSync side dedupes on this.

PAYLOAD CONTRACT (what we send)
{
  "idempotency_key": "<reports.id>",
  "lead_source": "permitcheck",
  "agency_id": "<Wiley-Wilson UUID>",
  "consent": {
    "given_at": "<ISO8601>",
    "ip": "<request IP>",
    "version": "permitcheck-checkout-v1",
    "sms_opt_in": true,
    "phone_consent": true
  },
  "contact": {
    "first_name": "...",
    "last_name":  "...",
    "email":      "...",
    "phone":      "+15551234567"      // E.164 only
  },
  "property": {
    "street_address": "...",
    "city":  "...",
    "state": "GA",
    "zip":   "30310",
    "year_built":     1925,
    "square_footage": 1840,
    "owns_home":      true              // false for investor flips
  },
  "diligence_payload": {
    "report_id":        "<reports.id>",
    "report_url":       "<signed URL, 30-day TTL>",
    "buyer_intent":     "primary_residence | rental | flip | portfolio_hold",
    "risk_level":       "low | medium | high",
    "red_flag_count":   3,
    "red_flag_categories": ["electrical","roof","unpermitted_work"],
    "contractor_quality_score": 6,
    "parcel_id":        "...",
    "jurisdiction":     "atlanta"
  }
}

WHEN TO FIRE
- After report.complete succeeds AND the buyer ticked the
  insurance opt-in checkbox at Stripe Checkout.
- Implement as an Inngest step at the end of the report pipeline
  (step.run("push_to_quotesync", ...)) so retries are handled by
  Inngest's framework. Don't block report delivery on the lead push
  — fire-and-forget with logging.
- Log full request/response to report_events with
  event_type='lead_pushed' so we have an audit trail. Redact email
  and phone in info-level logs (PII discipline from CLAUDE.md).

RESPONSE HANDLING
- 200 with { "lead_id": "<uuid>" } → log success, store lead_id
  in reports.diligence_lead_id (add column).
- 409 → already exists, treat as success.
- 4xx other → log, alert Cameron, don't retry.
- 5xx → let Inngest retry (default policy: 3x exponential backoff).

CONSENT UI (PermitCheck side)
- New checkbox at Stripe Checkout's success page or a dedicated
  pre-payment step:
  "Get a property-specific insurance quote from Wiley-Wilson Agency
   (licensed in GA). I consent to be contacted by phone, SMS, and
   email about insurance quotes for this property."
- Unbundled — separate from ToS acceptance.
- Store the consent payload in a new `report_consents` table with
  given_at, ip, user_agent, version. Don't piggyback on the
  reports row.

DEFINITION OF DONE
- Test event sent from staging PermitCheck to staging QuoteSync,
  lead row appears, surfaces in QuoteSync's Today queue with
  "PermitCheck" badge.
- Eval fixture added: a fake report.complete with opt-in=true
  fires exactly one webhook with a valid HMAC signature.
- Logs show no PII at info level.
- Cameron reviews end-to-end on a real Atlanta property before
  enabling for production.

OUT OF SCOPE FOR THIS TASK
- Bland AI auto-call on the QuoteSync side (separate phase 1.1.2)
- Bidirectional sync (lead status flowing back into PermitCheck)
- Multi-agency routing (we're single-agency for v1.1)
