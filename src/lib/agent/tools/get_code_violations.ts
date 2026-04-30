import { z } from "zod";
import {
  getCodeViolationsInputSchema,
  getCodeViolationsOutputSchema,
} from "../schemas";

export type GetCodeViolationsInput = z.infer<typeof getCodeViolationsInputSchema>;
export type GetCodeViolationsOutput = z.infer<typeof getCodeViolationsOutputSchema>;

/**
 * SPEC §10 tool: code enforcement / housing violation records for the
 * property. Returns date, description, resolution status, associated fines.
 *
 * Scaffold only — implementation lands in PR5+.
 */
export async function getCodeViolations(
  input: GetCodeViolationsInput
): Promise<GetCodeViolationsOutput> {
  getCodeViolationsInputSchema.parse(input);
  throw new Error("get_code_violations: not implemented (PR3 scaffold)");
}
