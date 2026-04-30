import { z } from "zod";
import { generateOutputSchema } from "./generate";

/**
 * SPEC §10 Step 8 — Persistence + delivery (5s budget).
 *   - Save JSON to reports.report_json
 *   - Render PDF via Playwright + @sparticuz/chromium-min, upload to Storage
 *   - Send email via Resend
 *   - Push Supabase Realtime event flipping status to `complete` (or
 *     `pending_review` for first 100 reports per AUTO_DELIVER_REPORTS gate)
 */

export const deliverInputSchema = z.object({
  report_id: z.string().uuid(),
  report: generateOutputSchema,
});
export type DeliverInput = z.infer<typeof deliverInputSchema>;

export const deliverOutputSchema = z.object({
  report_id: z.string().uuid(),
  status: z.enum(["complete", "pending_review"]),
  pdf_storage_path: z.string(),
  email_sent: z.boolean(),
});
export type DeliverOutput = z.infer<typeof deliverOutputSchema>;

export async function deliver(input: DeliverInput): Promise<DeliverOutput> {
  deliverInputSchema.parse(input);
  throw new Error("deliver: not implemented (PR3 scaffold)");
}
