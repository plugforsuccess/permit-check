import { z } from "zod";
import {
  getContractorRecordInputSchema,
  getContractorRecordOutputSchema,
} from "../schemas";

export type GetContractorRecordInput = z.infer<typeof getContractorRecordInputSchema>;
export type GetContractorRecordOutput = z.infer<typeof getContractorRecordOutputSchema>;

/**
 * SPEC §10 tool: GA Secretary of State licensing lookup. Returns license
 * status, expiration, disciplinary actions, complaint history.
 *
 * Scaffold only — implementation lands in PR5+.
 */
export async function getContractorRecord(
  input: GetContractorRecordInput
): Promise<GetContractorRecordOutput> {
  getContractorRecordInputSchema.parse(input);
  throw new Error("get_contractor_record: not implemented (PR3 scaffold)");
}
