import { z } from "zod";
import {
  getPermitDocumentInputSchema,
  getPermitDocumentOutputSchema,
} from "../schemas";

export type GetPermitDocumentInput = z.infer<typeof getPermitDocumentInputSchema>;
export type GetPermitDocumentOutput = z.infer<typeof getPermitDocumentOutputSchema>;

/**
 * SPEC §10 tool: extracts text from a full permit PDF. Called selectively
 * when a permit's structured record is ambiguous — expensive (vision call).
 *
 * Scaffold only — implementation lands in PR5+. The depth-decision step
 * (SPEC §10 step 6) gates how often this tool is invoked.
 */
export async function getPermitDocument(
  input: GetPermitDocumentInput
): Promise<GetPermitDocumentOutput> {
  getPermitDocumentInputSchema.parse(input);
  throw new Error("get_permit_document: not implemented (PR3 scaffold)");
}
