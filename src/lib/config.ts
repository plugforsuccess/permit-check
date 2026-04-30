import { env } from "./env";

export const config = {
  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  },
  accela: {
    apiBaseUrl: "https://apis.accela.com/v4",
    portalBaseUrl: "https://aca-prod.accela.com/ATLANTA_GA",
    appId: env.ACCELA_APP_ID ?? "",
    appSecret: env.ACCELA_APP_SECRET ?? "",
    agency: "ATLANTA_GA",
    environment: env.ACCELA_ENVIRONMENT,
  },
  pricing: {
    singleLookup: 2900, // $29.00 in cents
    buyerPlan: 2900, // $29/month in cents
  },
  app: {
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    reportExpiryHours: 48,
  },
} as const;

// Re-export for backward compatibility in server code
export { DISCLAIMER } from "./constants";
