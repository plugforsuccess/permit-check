import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Client-side Supabase client (uses anon key)
export function createBrowserClient() {
  return createClient(config.supabase.url, config.supabase.anonKey);
}

// Server-side Supabase client (uses service role key for admin operations)
export function createServerClient() {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
