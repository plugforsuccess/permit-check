/**
 * Vitest setup — populates process.env with stub values so that modules
 * which validate env at load time (src/lib/env.ts) don't throw when
 * imported transitively from tests.
 *
 * Production env validation runs at server boot via env.ts; tests only
 * need the schema to parse cleanly so unrelated tests can import library
 * code that depends on env.
 */

process.env.NODE_ENV ??= "test";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "stub_anon_key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "stub_service_role";
process.env.STRIPE_SECRET_KEY ??= "sk_test_stub";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_stub";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_stub";
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??= "stub_maps";
process.env.GOOGLE_MAPS_SERVER_KEY ??= "stub_maps_server";
process.env.RESEND_API_KEY ??= "re_stub";
process.env.UPSTASH_REDIS_REST_URL ??= "https://stub.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "stub_redis_token";
process.env.CRON_SECRET ??= "stub_cron_secret";
