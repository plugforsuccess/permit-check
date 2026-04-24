import type { AgentReport, AgentRunResult } from "@/lib/agent";
import type { EvaluationCheck, GoldenFixture, RedFlagCategory } from "./types";

/**
 * Deterministic rule-based evaluator. Does NOT use a model — keeps the
 * eval reproducible and free to run. Each check is a pass/fail with
 * a detail string for debugging.
 */
export function evaluateAgentRun(
  fixture: GoldenFixture,
  run: AgentRunResult
): EvaluationCheck[] {
  const checks: EvaluationCheck[] = [];

  checks.push({
    name: "status=complete",
    passed: run.status === "complete",
    detail: `status=${run.status}${run.error ? ` err=${run.error}` : ""}`,
  });

  if (!run.report) {
    checks.push({ name: "report_generated", passed: false });
    return checks;
  }
  checks.push({ name: "report_generated", passed: true });

  const report = run.report;
  const exp = fixture.expected;

  // 1. Risk level.
  const allowedLevels = exp.risk_level_tolerance ?? [exp.risk_level];
  checks.push({
    name: "risk_level_matches",
    passed: allowedLevels.includes(report.risk_level),
    detail: `got=${report.risk_level} expected∈[${allowedLevels.join(",")}]`,
  });

  // 2. Required red flag categories.
  const categoriesPresent: Set<RedFlagCategory> = new Set(
    report.red_flags.map((rf) => rf.category)
  );
  for (const required of exp.required_red_flag_categories as RedFlagCategory[]) {
    checks.push({
      name: `required_category:${required}`,
      passed: categoriesPresent.has(required),
    });
  }

  // 3. Forbidden categories.
  for (const forbidden of exp.forbidden_red_flag_categories) {
    checks.push({
      name: `forbidden_category:${forbidden}`,
      passed: !categoriesPresent.has(forbidden as RedFlagCategory),
    });
  }

  // 4. Red flag count bounds.
  checks.push({
    name: "min_red_flags",
    passed: report.red_flags.length >= exp.min_red_flags,
    detail: `count=${report.red_flags.length} min=${exp.min_red_flags}`,
  });
  if (exp.max_red_flags != null) {
    checks.push({
      name: "max_red_flags",
      passed: report.red_flags.length <= exp.max_red_flags,
      detail: `count=${report.red_flags.length} max=${exp.max_red_flags}`,
    });
  }

  // 5. Questions for seller.
  checks.push({
    name: "min_questions_for_seller",
    passed: report.questions_for_seller.length >= exp.min_questions_for_seller,
    detail: `count=${report.questions_for_seller.length}`,
  });

  // 6. Next steps.
  if (exp.require_non_empty_next_steps) {
    checks.push({
      name: "non_empty_next_steps",
      passed: report.recommended_next_steps.length > 0,
    });
  }

  // 7. Executive summary not blank.
  checks.push({
    name: "executive_summary_not_blank",
    passed: report.executive_summary.trim().length > 20,
  });

  // 8. Hallucination check: every red_flag.evidence that references a record
  // number must cite a permit that actually exists in the tool outputs.
  checks.push(hallucinationCheck(report, run));

  return checks;
}

function hallucinationCheck(
  report: AgentReport,
  run: AgentRunResult
): EvaluationCheck {
  const search = run.toolOutputs.search_permits as
    | { permits?: Array<{ recordNumber: string }> }
    | undefined;
  const knownRecords = new Set(
    (search?.permits ?? []).map((p) => p.recordNumber)
  );

  // Match any token that looks like an Accela record number: letters + dash + digits.
  const recordPattern = /[A-Z]+[A-Z0-9]*-\d[\w-]*/g;
  const unsupported: string[] = [];

  for (const rf of report.red_flags) {
    const refs = rf.evidence.match(recordPattern) ?? [];
    for (const ref of refs) {
      if (!knownRecords.has(ref)) {
        unsupported.push(ref);
      }
    }
  }

  return {
    name: "no_hallucinated_record_refs",
    passed: unsupported.length === 0,
    detail: unsupported.length
      ? `unknown refs: ${unsupported.slice(0, 5).join(", ")}`
      : undefined,
  };
}

export function passed(checks: EvaluationCheck[]): boolean {
  return checks.every((c) => c.passed);
}
