# PermitCheck

**Real Estate Permit Verification Platform**

PermitCheck searches official government permit databases and delivers a property's full permit history in seconds. Built for real estate investors, agents, and buyers who need to verify whether work on a property was properly permitted before closing a transaction.

## What It Does

Unpermitted work is one of the most common and expensive surprises in real estate. A renovation done without permits can cost a new owner tens of thousands to remediate — or become a liability in a future sale.

PermitCheck solves this by pulling permit records directly from government Accela portals and presenting them in a clean, searchable report:

- **Instant permit history lookup** — enter any supported address and get results in ~20 seconds
- **Permit status tracking** — see which permits are Issued, Finaled, Expired, In Review, Pending, or Void
- **Risk assessment** — AI-powered summary flags potential issues like missing permits, expired permits, or unpermitted renovation work
- **Downloadable PDF reports** — standard reports for buyers and litigation-grade attorney reports with chain of custody
- **Multi-jurisdiction support** — currently covers City of Atlanta and Gwinnett County, GA

## Key Features

- **Address autocomplete** — Google Maps–powered address input with structured address parsing
- **Accela portal scraping** — automated data extraction from government permit portals via Cheerio + Puppeteer (interim solution pending Accela API approval)
- **24-hour result caching** — repeat lookups for the same address return cached results
- **Stripe payment gate** — $9.99 standard reports and $199 attorney-grade reports; permits are locked behind payment
- **PDF report generation** — server-side PDF rendering via `@react-pdf/renderer`
- **AI-powered permit summaries** — risk-level classification (low/medium/high) with verdict, flags, and seller questions
- **Property data enrichment** — street view imagery and property context via Google Maps
- **Rate limiting** — Upstash Redis–based rate limiting on the lookup endpoint (5 requests/minute/IP)
- **CSRF protection** — Origin header validation on all API routes
- **Row Level Security** — Supabase RLS policies ensure users can only access their own data
- **Zod validation** — all user inputs validated server-side before processing
- **Unit/condo detection** — identifies unit addresses and adjusts search and risk assessment accordingly
- **Referral CTAs** — contextual calls-to-action for home services (inspectors, contractors, attorneys)
- **User dashboard** — authenticated users can view their lookup history

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| Auth & Database | Supabase (PostgreSQL + Auth + RLS) |
| Payments | Stripe (Checkout + Webhooks) |
| Styling | Tailwind CSS 4 |
| Scraping | Cheerio, Puppeteer, Playwright |
| Rate Limiting | Upstash Redis |
| PDF Generation | @react-pdf/renderer |
| Maps | Google Maps (autocomplete + street view) |
| Validation | Zod |
| AI | Anthropic Claude API (permit summaries) |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 20+
- npm, yarn, or pnpm
- A Supabase project
- A Stripe account
- Upstash Redis instance
- Google Maps API key

### Installation

```bash
git clone <repo-url>
cd permit-check
npm install
```

### Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) below for details on each variable.

### Run Database Migrations

Apply the Supabase migrations to set up your database schema:

```bash
npx supabase db push
```

### Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other Commands

```bash
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only — never expose to client) |
| `STRIPE_SECRET_KEY` | Stripe secret API key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for verifying webhook events |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for client-side Checkout |
| `NEXT_PUBLIC_APP_URL` | Public-facing app URL (e.g. `https://permitcheck.com`) |
| `ACCELA_APP_ID` | Accela Developer API application ID |
| `ACCELA_APP_SECRET` | Accela Developer API secret (server-only) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST auth token |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key for client-side autocomplete and maps |
| `GOOGLE_MAPS_SERVER_KEY` | Google Maps API key for server-side street view requests |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI-powered permit summaries |
| `REAPI_API_KEY` | RE API key for property data enrichment |
| `HOMEADVISOR_AFFILIATE_ID` | HomeAdvisor affiliate ID for referral CTAs |
| `LENDINGTREE_AFFILIATE_ID` | LendingTree affiliate ID for referral CTAs |
| `AVVO_AFFILIATE_ID` | Avvo affiliate ID for attorney referral CTAs |

## Database Schema

The Supabase PostgreSQL database consists of the following tables, managed through seven migrations:

### `users`
Extends Supabase `auth.users`. Stores plan type (`free`, `buyer`, `agent`, `investor`) and Stripe customer ID.

### `lookups`
Core table tracking each address lookup. Stores the raw and normalized address, payment status, jurisdiction ID (e.g. `ATLANTA_GA`), report type (`standard` or `attorney`), and unit detection flags. Cached for 24 hours.

### `permits`
Individual permit records tied to a lookup. Each record includes the permit number, type, status, filed/issued dates, description, contractor name, and address.

### `reports`
Generated PDF reports linked to a lookup. Includes the PDF storage URL, expiration timestamp, secure download token, optional matter reference (for attorney reports), AI-generated summary text, and risk level classification.

All tables have Row Level Security enabled. Users can only read their own data; the service role has full access for server-side operations.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── checkout/create/       # Stripe Checkout session creation
│   │   ├── lookup/
│   │   │   ├── initiate/          # Start a new permit lookup
│   │   │   └── [id]/
│   │   │       ├── scrape/        # Trigger Accela portal scraping
│   │   │       ├── status/        # Poll lookup progress
│   │   │       └── results/       # Fetch completed permit results
│   │   ├── report/[id]/download/  # Secure PDF report download
│   │   ├── street-view/           # Google Street View proxy
│   │   ├── user/history/          # User lookup history
│   │   └── webhooks/stripe/       # Stripe webhook handler
│   ├── dashboard/                 # User dashboard page
│   ├── results/[id]/              # Permit results page
│   ├── searching/[id]/            # Loading/polling page
│   ├── layout.tsx
│   └── page.tsx                   # Landing page
├── components/
│   ├── AddressAutocomplete.tsx    # Google Maps address input
│   ├── Disclaimer.tsx             # Legal disclaimer
│   ├── ErrorBoundary.tsx
│   ├── GoogleMapsProvider.tsx
│   ├── Logo.tsx
│   ├── PermitTable.tsx            # Permit results table
│   ├── PropertyStreetView.tsx     # Street view image component
│   └── ReferralCTAs.tsx           # Contextual service referrals
├── lib/
│   ├── accela/
│   │   ├── index.ts               # Accela module entry point
│   │   ├── jurisdictions.ts       # Jurisdiction configs (Atlanta, Gwinnett)
│   │   ├── normalize.ts           # Permit data normalization
│   │   └── scraper.ts             # Accela portal scraper
│   ├── supabase/
│   │   ├── client.ts              # Browser Supabase client
│   │   └── server.ts              # Server-side Supabase client
│   ├── address.ts                 # Address parsing and normalization
│   ├── config.ts                  # App configuration
│   ├── constants.ts
│   ├── csrf.ts                    # CSRF protection middleware
│   ├── env.ts                     # Environment variable validation
│   ├── logger.ts                  # Structured logging
│   ├── pdf.ts                     # PDF utilities
│   ├── pdf-generator.ts           # PDF report generation
│   ├── property-data.ts           # Property data enrichment
│   ├── ratelimit.ts               # Upstash rate limiting
│   ├── schemas.ts                 # Zod validation schemas
│   ├── stripe.ts                  # Stripe client setup
│   └── summary.ts                 # AI permit risk summary
├── types/
│   └── index.ts                   # TypeScript type definitions
└── middleware.ts                   # CSRF middleware for API routes
```

## Roadmap

- [ ] Accela Developer API integration (pending agency approval, replacing scraper)
- [ ] Additional Georgia jurisdictions (DeKalb County, Cobb County, Fulton County)
- [ ] Expansion to other states and metro areas
- [ ] Subscription plans for agents and investors (bulk lookups)
- [ ] Saved properties and monitoring for permit status changes
- [ ] Comparative permit analysis across similar properties
- [ ] Integration with title companies and closing platforms
- [ ] Mobile-optimized experience

## License

TBD
