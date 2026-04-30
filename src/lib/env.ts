/**
 * Single source of truth for environment variables.
 *
 * - Server: validates the full schema (server + public vars) at module load.
 *   Throws a single readable error if anything is missing — server fails fast.
 * - Client: validates only the NEXT_PUBLIC_* schema. Next.js inlines these at
 *   build time, so the client bundle never sees server secrets.
 *
 * Acceptance: this is the ONLY place process.env.X may appear in src/.
 * Everywhere else imports the typed `env` object from here.
 */

import { z } from "zod";

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const boolFlag = z
  .string()
  .transform((v) => v === "true")
  .default(false);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1),
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_AFFILIATE_ATTORNEY: z.string().optional(),
  NEXT_PUBLIC_AFFILIATE_INSPECTOR: z.string().optional(),
  NEXT_PUBLIC_AFFILIATE_CONTRACTOR: z.string().optional(),
  NEXT_PUBLIC_AFFILIATE_MORTGAGE: z.string().optional(),
  NEXT_PUBLIC_AFFILIATE_AGENT: z.string().optional(),
});

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Anthropic — model IDs pinned per SPEC §15.
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL_ORCHESTRATOR: z.string().default("claude-sonnet-4-5"),
  ANTHROPIC_MODEL_REPORTER: z.string().default("claude-opus-4-7"),

  // Google
  GOOGLE_MAPS_SERVER_KEY: z.string().min(1),

  // Inngest — required at boot per SPEC §15 and per D33: the
  // USE_INNGEST_REPORTS flag flips in PR6, after which any unset key
  // here would silently break event signing or webhook auth. Fail-fast
  // at boot beats a missing-key surprise in production.
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email().default("reports@permitcheck.org"),
  HEALTH_CHECK_ALERT_EMAIL: z.string().email().optional(),

  // Monitoring (Axiom). Optional so local dev runs without an Axiom dataset.
  // Sentry is deferred to PR8.
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),

  // Rate limiting
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Accela (optional — current scraper goes through the public portal)
  ACCELA_APP_ID: z.string().optional(),
  ACCELA_APP_SECRET: z.string().optional(),
  ACCELA_ENVIRONMENT: z.string().default("PROD"),

  // Property data enrichment (optional)
  REAPI_API_KEY: z.string().optional(),

  // Cron auth
  CRON_SECRET: z.string().min(1),

  // Affiliate IDs (server-side variants — optional)
  HOMEADVISOR_AFFILIATE_ID: z.string().optional(),
  LENDINGTREE_AFFILIATE_ID: z.string().optional(),
  AVVO_AFFILIATE_ID: z.string().optional(),

  // Feature flags (boolean strings → booleans). All default false.
  USE_INNGEST_REPORTS: boolFlag,
  AUTO_DELIVER_REPORTS: boolFlag,
  LOG_FULL_ADDRESS: boolFlag,
  FETCH_INSPECTION_HISTORY: boolFlag,
});

const fullSchema = serverSchema.merge(publicSchema);

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

const isServer = typeof window === "undefined";

/**
 * On the client, Next.js inlines `process.env.NEXT_PUBLIC_X` references at
 * build time. There is no `process.env` object at runtime — only the literal
 * substitutions in compiled code. So we can't do `safeParse(process.env)` on
 * the client; we have to enumerate the public vars by hand.
 */
function buildClientEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    NEXT_PUBLIC_AFFILIATE_ATTORNEY: process.env.NEXT_PUBLIC_AFFILIATE_ATTORNEY,
    NEXT_PUBLIC_AFFILIATE_INSPECTOR: process.env.NEXT_PUBLIC_AFFILIATE_INSPECTOR,
    NEXT_PUBLIC_AFFILIATE_CONTRACTOR: process.env.NEXT_PUBLIC_AFFILIATE_CONTRACTOR,
    NEXT_PUBLIC_AFFILIATE_MORTGAGE: process.env.NEXT_PUBLIC_AFFILIATE_MORTGAGE,
    NEXT_PUBLIC_AFFILIATE_AGENT: process.env.NEXT_PUBLIC_AFFILIATE_AGENT,
  };
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

function loadEnv(): z.infer<typeof fullSchema> {
  if (isServer) {
    const result = fullSchema.safeParse(process.env);
    if (!result.success) {
      // Single readable error — server fails fast on misconfiguration.
      throw new Error(
        `[env] Server boot failed — environment validation failed:\n${formatIssues(
          result.error.issues
        )}`
      );
    }
    return result.data;
  }

  // Client: only NEXT_PUBLIC_* exist. Type-cast to the full shape so callers
  // get ergonomic access; reading server-only fields on the client returns
  // undefined at runtime (and Next.js dev server logs this loudly).
  const result = publicSchema.safeParse(buildClientEnv());
  if (!result.success) {
    throw new Error(
      `[env] Client validation failed:\n${formatIssues(result.error.issues)}`
    );
  }
  return result.data as z.infer<typeof fullSchema>;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export const env = loadEnv();

export type Env = typeof env;
