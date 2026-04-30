import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { reportRequested } from "@/lib/agent/orchestrator";

/**
 * Inngest webhook receiver. The Inngest dev server (and Inngest Cloud,
 * post-launch) POSTs registered functions here. SDK exposes GET/POST/PUT
 * — GET serves the function list for discovery, POST runs functions, PUT
 * registers them.
 *
 * No CSRF check needed: Inngest signs every request with INNGEST_SIGNING_KEY
 * and the SDK's serve() helper verifies that signature.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reportRequested],
});
