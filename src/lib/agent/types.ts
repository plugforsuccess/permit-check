import { z } from "zod";

export type AgentIntent = "flip" | "rental" | "primary_residence" | "portfolio_hold";

export type AgentStatus =
  | "pending"
  | "normalizing"
  | "gathering"
  | "analyzing"
  | "generating"
  | "complete"
  | "failed";

export type AgentEventType =
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "tool_called"
  | "tool_returned"
  | "tool_failed"
  | "llm_called"
  | "llm_returned"
  | "error"
  | "info";

export interface AgentEvent {
  event_type: AgentEventType;
  step_name?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface PropertyFacts {
  rawAddress: string;
  normalizedAddress: string;
  jurisdiction: string;
  parcelId: string | null;
  yearBuilt: number | null;
  squareFeet: number | null;
  propertyType: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  ownerName: string | null;
  isInvestorOwned: boolean | null;
}

export const investigationPlanSchema = z.object({
  priority_checks: z.array(z.string()).default([]),
  risk_signals_to_watch: z.array(z.string()).default([]),
  minimum_permit_lookback_years: z.number().int().min(1).max(100).default(25),
  require_contractor_verification: z.boolean().default(true),
  require_violation_check: z.boolean().default(true),
  require_aerial_comparison: z.boolean().default(false),
  estimated_complexity: z.enum(["low", "medium", "high"]).default("medium"),
});

export type InvestigationPlan = z.infer<typeof investigationPlanSchema>;

export const redFlagSchema = z.object({
  category: z.enum([
    "unpermitted_work",
    "open_permit",
    "expired_permit",
    "code_violation",
    "contractor_quality",
    "ownership_pattern",
    "incomplete_data",
  ]),
  severity: z.enum(["critical", "major", "minor"]),
  finding: z.string().min(1).max(500),
  why_it_matters: z.string().min(1).max(500),
  evidence: z.string().min(1).max(500),
});

export type RedFlag = z.infer<typeof redFlagSchema>;

export const agentReportSchema = z.object({
  executive_summary: z.string().min(1).max(1000),
  risk_level: z.enum(["low", "medium", "high"]),
  permit_timeline: z
    .array(
      z.object({
        year: z.number().int(),
        summary: z.string().max(500),
      })
    )
    .default([]),
  red_flags: z.array(redFlagSchema).default([]),
  green_signals: z.array(z.string().max(500)).default([]),
  unpermitted_work_assessment: z.object({
    likelihood: z.enum(["high", "medium", "low", "none_detected", "incomplete_data"]),
    suspected_categories: z.array(z.string()).default([]),
    evidence: z.string().max(1000).default(""),
  }),
  contractor_quality_score: z.number().int().min(1).max(10).nullable().default(null),
  questions_for_seller: z.array(z.string().max(500)).default([]),
  recommended_next_steps: z.array(z.string().max(500)).default([]),
});

export type AgentReport = z.infer<typeof agentReportSchema>;

export interface ToolOutputs {
  search_permits?: unknown;
  get_property_records?: unknown;
  get_code_violations?: unknown;
  get_contractor_record?: unknown[];
  compare_footprint_to_permits?: unknown;
}

export interface AgentRunResult {
  reportId: string | null;
  status: AgentStatus;
  durationSeconds: number;
  llmCostUsd: number;
  property: PropertyFacts;
  plan: InvestigationPlan;
  toolOutputs: ToolOutputs;
  report: AgentReport | null;
  error?: string;
}
