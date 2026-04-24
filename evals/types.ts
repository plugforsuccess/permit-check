import { z } from "zod";
import type { AgentIntent } from "@/lib/agent";

export const goldenFixtureSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  intent: z.enum(["flip", "rental", "primary_residence", "portfolio_hold"]),
  notes: z.string().optional(),

  // Replay data. When provided, the agent uses these instead of live network
  // calls — makes the eval deterministic and runnable without scraping.
  replay: z
    .object({
      permits: z
        .object({
          permits: z.array(z.unknown()),
          truncated: z.boolean().default(false),
          usedFuzzyMatch: z.boolean().default(false),
        })
        .optional(),
      property: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .optional(),

  expected: z.object({
    risk_level: z.enum(["low", "medium", "high"]),
    risk_level_tolerance: z
      .array(z.enum(["low", "medium", "high"]))
      .optional()
      .describe("Acceptable risk levels. Defaults to just [risk_level]."),
    required_red_flag_categories: z
      .array(
        z.enum([
          "unpermitted_work",
          "open_permit",
          "expired_permit",
          "code_violation",
          "contractor_quality",
          "ownership_pattern",
          "incomplete_data",
        ])
      )
      .default([]),
    forbidden_red_flag_categories: z
      .array(z.string())
      .default([])
      .describe("Categories the agent must NOT flag."),
    min_red_flags: z.number().int().nonnegative().default(0),
    max_red_flags: z.number().int().nonnegative().optional(),
    min_questions_for_seller: z.number().int().nonnegative().default(1),
    require_non_empty_next_steps: z.boolean().default(true),
  }),
});

export type GoldenFixture = z.infer<typeof goldenFixtureSchema>;

export type RedFlagCategory =
  | "unpermitted_work"
  | "open_permit"
  | "expired_permit"
  | "code_violation"
  | "contractor_quality"
  | "ownership_pattern"
  | "incomplete_data";

export interface FixtureRunResult {
  fixtureId: string;
  address: string;
  intent: AgentIntent;
  durationSeconds: number;
  llmCostUsd: number;
  status: string;
  checks: EvaluationCheck[];
  passed: boolean;
  reportSummary?: {
    risk_level: string;
    red_flag_count: number;
    red_flag_categories: string[];
  };
  error?: string;
}

export interface EvaluationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}
