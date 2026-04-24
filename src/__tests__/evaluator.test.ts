import { describe, it, expect } from "vitest";
import { evaluateAgentRun, passed } from "../../evals/evaluator";
import { goldenFixtureSchema } from "../../evals/types";
import type { AgentReport, AgentRunResult } from "../lib/agent";

function baseReport(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    executive_summary:
      "Property has a mix of finaled and expired permits; review needed.",
    risk_level: "medium",
    permit_timeline: [],
    red_flags: [],
    green_signals: [],
    unpermitted_work_assessment: {
      likelihood: "none_detected",
      suspected_categories: [],
      evidence: "",
    },
    contractor_quality_score: 7,
    questions_for_seller: ["Any work done without permits?"],
    recommended_next_steps: ["Inspection"],
    ...overrides,
  };
}

function baseRun(report: AgentReport | null, permits: Array<{ recordNumber: string }> = []): AgentRunResult {
  return {
    reportId: null,
    status: report ? "complete" : "failed",
    durationSeconds: 1,
    llmCostUsd: 0,
    property: {
      rawAddress: "x",
      normalizedAddress: "x",
      jurisdiction: "ATLANTA_GA",
      parcelId: null,
      yearBuilt: null,
      squareFeet: null,
      propertyType: null,
      lastSaleDate: null,
      lastSalePrice: null,
      ownerName: null,
      isInvestorOwned: null,
    },
    plan: {
      priority_checks: [],
      risk_signals_to_watch: [],
      minimum_permit_lookback_years: 25,
      require_contractor_verification: false,
      require_violation_check: false,
      require_aerial_comparison: false,
      estimated_complexity: "low",
    },
    toolOutputs: { search_permits: { permits } },
    report,
  };
}

describe("evaluateAgentRun", () => {
  it("passes when report matches expected risk and categories", () => {
    const fixture = goldenFixtureSchema.parse({
      id: "t",
      label: "t",
      address: "1 Test St",
      intent: "flip",
      expected: {
        risk_level: "medium",
        risk_level_tolerance: ["medium", "high"],
        required_red_flag_categories: ["expired_permit"],
        min_red_flags: 1,
        min_questions_for_seller: 1,
        require_non_empty_next_steps: true,
      },
    });

    const report = baseReport({
      red_flags: [
        {
          category: "expired_permit",
          severity: "major",
          finding: "BLD-2019-00842 expired",
          why_it_matters: "Inherited liability",
          evidence: "Record BLD-2019-00842",
        },
      ],
    });

    const checks = evaluateAgentRun(
      fixture,
      baseRun(report, [{ recordNumber: "BLD-2019-00842" }])
    );
    expect(passed(checks)).toBe(true);
  });

  it("fails when risk level is outside tolerance", () => {
    const fixture = goldenFixtureSchema.parse({
      id: "t",
      label: "t",
      address: "1 Test St",
      intent: "flip",
      expected: {
        risk_level: "low",
        risk_level_tolerance: ["low"],
        min_red_flags: 0,
      },
    });
    const report = baseReport({ risk_level: "high" });
    const checks = evaluateAgentRun(fixture, baseRun(report));
    expect(checks.find((c) => c.name === "risk_level_matches")?.passed).toBe(false);
  });

  it("catches hallucinated record numbers in evidence", () => {
    const fixture = goldenFixtureSchema.parse({
      id: "t",
      label: "t",
      address: "1 Test St",
      intent: "flip",
      expected: { risk_level: "medium" },
    });
    const report = baseReport({
      risk_level: "medium",
      red_flags: [
        {
          category: "expired_permit",
          severity: "major",
          finding: "Invented permit",
          why_it_matters: "n/a",
          evidence: "Record BLD-2099-99999 does not exist",
        },
      ],
    });
    const checks = evaluateAgentRun(
      fixture,
      baseRun(report, [{ recordNumber: "BLD-2024-00521" }])
    );
    expect(checks.find((c) => c.name === "no_hallucinated_record_refs")?.passed).toBe(false);
  });
});
