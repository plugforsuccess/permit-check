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
    attorneyReport: 19900, // $199.00 in cents
    buyerPlan: 2900, // $29/month in cents
    agentPlan: 9900, // $99/month in cents
  },
  app: {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    reportExpiryHours: 48,
  },
} as const;

export const DISCLAIMER = `DISCLAIMER: PermitCheck retrieves publicly available permit records from the City of Atlanta's Accela database. Results reflect records found in that system as of the date of lookup. Incomplete municipal records, address formatting variations, or data entry errors may affect results. This report does not constitute a legal determination of code compliance, permit status, or property condition. Consult a licensed attorney or building inspector for legal or professional advice.`;
