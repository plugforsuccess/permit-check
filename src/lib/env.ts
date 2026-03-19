/**
 * Validate required environment variables at startup.
 * Import this in the root layout so the app crashes loudly
 * on missing config rather than failing silently at runtime.
 */

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(", ")}`
  );
}
