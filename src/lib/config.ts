export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  accela: {
    apiBaseUrl: "https://apis.accela.com/v4",
    portalBaseUrl: "https://aca-prod.accela.com/ATLANTA_GA",
    appId: process.env.ACCELA_APP_ID || "",
    appSecret: process.env.ACCELA_APP_SECRET || "",
    agency: "ATLANTA_GA",
    environment: process.env.ACCELA_ENVIRONMENT || "PROD",
  },
  pricing: {
    singleLookup: 999, // $9.99 in cents
    buyerPlan: 2900, // $29/month in cents
  },
  app: {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    reportExpiryHours: 48,
  },
} as const;

// Re-export for backward compatibility in server code
export { DISCLAIMER } from "./constants";
