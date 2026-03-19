import "server-only";
import { supabaseAdmin } from "./supabase/server";

// Wrapper function for API routes. Returns the server-only admin client.
// Client components should import from "@/lib/supabase/client" instead.
export function createServerClient() {
  return supabaseAdmin;
}
