import { describe, it, expect } from "vitest";
import { runAgent } from "../lib/agent";
import type { ClaudeCallOptions, ClaudeCallResult } from "../lib/agent";

function makeStubLlm(
  responses: Partial<Record<"planning" | "analysis", unknown>>
) {
  return async (opts: ClaudeCallOptions): Promise<ClaudeCallResult> => {
    const isPlanning = opts.systemPrompt.includes("planning module");
    const payload = isPlanning
      ? responses.planning ?? {
          priority_checks: ["permits"],
          risk_signals_to_watch: [],
          minimum_permit_lookback_years: 25,
          require_contractor_verification: true,
          require_violation_check: true,
          require_aerial_comparison: false,
          estimated_complexity: "medium",
        }
      : responses.analysis ?? {
          executive_summary: "All permits finaled, no issues detected.",
          risk_level: "low",
          permit_timeline: [{ year: 2024, summary: "Reroof finaled" }],
          red_flags: [],
          green_signals: ["All permits finaled"],
          unpermitted_work_assessment: {
            likelihood: "none_detected",
            suspected_categories: [],
            evidence: "All visible work matches permitted records.",
          },
          contractor_quality_score: 8,
          questions_for_seller: ["Any work done without permits?"],
          recommended_next_steps: ["Standard inspection"],
        };
    return {
      text: JSON.stringify(payload),
      inputTokens: 500,
      outputTokens: 300,
      model: opts.model,
    };
  };
}

describe("runAgent", () => {
  it("runs end-to-end with stubbed dependencies and returns a valid report", async () => {
    const result = await runAgent(
      { address: "842 Linwood Ave NE, Atlanta, GA 30306", intent: "primary_residence" },
      {
        llm: makeStubLlm({}),
        scrapePermits: async () => ({
          permits: [
            {
              recordNumber: "BLD-2024-00521",
              type: "Building Permit",
              status: "Finaled",
              filedDate: "2024-03-04",
              issuedDate: "2024-03-18",
              description: "Reroof",
              address: "842 LINWOOD AVE NE",
            },
          ],
          truncated: false,
          usedFuzzyMatch: false,
        }),
        fetchPropertyData: async () => null,
      }
    );

    expect(result.status).toBe("complete");
    expect(result.report).not.toBeNull();
    expect(result.report?.risk_level).toBe("low");
    expect(result.report?.red_flags).toHaveLength(0);
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.toolOutputs.search_permits).toBeDefined();
  });

  it("returns failed status when analysis JSON is malformed", async () => {
    const result = await runAgent(
      { address: "100 Test St NE, Atlanta, GA 30306" },
      {
        llm: async (opts) => ({
          text: opts.systemPrompt.includes("planning module")
            ? JSON.stringify({
                priority_checks: [],
                risk_signals_to_watch: [],
                minimum_permit_lookback_years: 25,
                require_contractor_verification: false,
                require_violation_check: false,
                require_aerial_comparison: false,
                estimated_complexity: "low",
              })
            : "not json at all",
          inputTokens: 0,
          outputTokens: 0,
          model: opts.model,
        }),
        scrapePermits: async () => ({ permits: [], truncated: false, usedFuzzyMatch: false }),
        fetchPropertyData: async () => null,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("analysis JSON invalid");
  });
});
