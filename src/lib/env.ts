/**
 * Validate required environment variables at runtime.
 * Exports a function that should be called from API routes and
 * server components to ensure all required env vars are present.
 *
 * We use a lazy check rather than a top-level throw so the build
 * succeeds without env vars (they're only needed at runtime).
 */

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

let validated = false;

export function validateEnv(): void {
  if (validated) return;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }

  validated = true;
}
