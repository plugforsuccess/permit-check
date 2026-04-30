import "server-only";
import { Inngest } from "inngest";
import { env } from "@/lib/env";

/**
 * Inngest client — single shared instance.
 *
 * `eventKey` is read from env.INNGEST_EVENT_KEY. In dev, the local Inngest
 * dev server accepts events without a key, so undefined is fine until PR5
 * flips the env contract to required (see SPEC §12 PR5 acceptance).
 */
export const inngest = new Inngest({
  id: "permit-check",
  eventKey: env.INNGEST_EVENT_KEY,
});
