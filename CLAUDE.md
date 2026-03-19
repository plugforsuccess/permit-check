# CLAUDE.md — PermitCheck

## Project
Next.js 16 app. TypeScript strict mode. Supabase for auth and database. Stripe for payments. Tailwind 4 for styles. Cheerio for Accela portal scraping (interim until Accela API approval).

## Key conventions
- All API routes live in src/app/api/
- Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, ACCELA_APP_SECRET) never appear in client components
- All user inputs are validated with Zod before use
- Stripe webhooks must verify signature before processing
- Rate limiting is enforced on /api/lookup/initiate

## Data sources
- Accela public portal: aca-prod.accela.com/ATLANTA_GA (scraping interim fallback)
- Accela Developer API: pending ATLANTA_GA agency approval at developer.accela.com

## Do not
- Scrape MLS data (FMLS/GAMLS) — ToS violation
- Make legal conclusions about permit compliance in any user-facing copy
- Expose service role key to the client under any circumstances
