import type { SupabaseClient } from "@supabase/supabase-js";
import type { PermitRecord } from "@/lib/accela";
import { normalizeAddress as normalizeForDisplay } from "@/lib/address";
import { detectJurisdiction } from "@/lib/accela/jurisdictions";
import { fetchPropertyData, type PropertyData } from "@/lib/property-data";
import { EventLogger } from "./events";
import { callClaude, estimateCostUsd, extractJson } from "./claude";
import {
  runTool,
  buildSearchPermitsTool,
  buildGetPropertyRecordsTool,
  buildGetCodeViolationsTool,
  buildGetContractorRecordTool,
  buildCompareFootprintTool,
  type ToolContext,
} from "./tools";
import {
  PLANNING_SYSTEM_PROMPT,
  buildPlanningUserPrompt,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from "./prompts";
import {
  agentReportSchema,
  investigationPlanSchema,
  type AgentIntent,
  type AgentReport,
  type AgentRunResult,
  type AgentStatus,
  type InvestigationPlan,
  type PropertyFacts,
  type ToolOutputs,
} from "./types";

/**
 * Injectable dependencies so tests can swap the scraper, property fetcher,
 * and Claude caller without hitting the network.
 */
export interface AgentDeps {
  supabase?: SupabaseClient | null;
  scrapePermits?: Parameters<typeof buildSearchPermitsTool>[0];
  fetchPropertyData?: typeof fetchPropertyData;
  llm?: typeof callClaude;
  planningModel?: string;
  analysisModel?: string;
}

export interface AgentRunInput {
  address: string;
  intent?: AgentIntent;
  jurisdiction?: string;
  reportId?: string | null;
  userId?: string | null;
}

const DEFAULT_PLANNING_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_ANALYSIS_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Synchronous agent run.
 * Step 1: Normalize address + detect jurisdiction.
 * Step 2: Resolve parcel / property facts.
 * Step 3: Plan (Sonnet).
 * Step 4: Parallel tool calls.
 * Step 5: Analyze (Sonnet) → produces the final structured JSON report.
 * Step 6: Persist to `agent_reports` if Supabase client supplied.
 */
export async function runAgent(
  input: AgentRunInput,
  deps: AgentDeps = {}
): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const intent: AgentIntent = input.intent ?? "flip";
  const llm = deps.llm ?? callClaude;
  const planningModel = deps.planningModel ?? DEFAULT_PLANNING_MODEL;
  const analysisModel = deps.analysisModel ?? DEFAULT_ANALYSIS_MODEL;
  const fetchProperty = deps.fetchPropertyData ?? fetchPropertyData;
  const supabase = deps.supabase ?? null;

  const events = new EventLogger({ reportId: input.reportId, supabase });

  let status: AgentStatus = "pending";
  const setStatus = async (next: AgentStatus, extra?: Record<string, unknown>) => {
    status = next;
    await events.log("step_started", next, extra);
    if (supabase && input.reportId) {
      await supabase
        .from("agent_reports")
        .update({ status: next, ...(next === "complete" ? {} : {}) })
        .eq("id", input.reportId)
        .then(() => undefined, (err) => {
          events.log("error", "supabase_update", { err: String(err) });
        });
    }
  };

  let totalCost = 0;
  const accrueCost = (
    model: string,
    inputTokens: number,
    outputTokens: number,
    step: string
  ) => {
    const cost = estimateCostUsd(model, inputTokens, outputTokens);
    totalCost += cost;
    events.log("llm_returned", step, { model, inputTokens, outputTokens, cost });
  };

  let property: PropertyFacts;
  let plan: InvestigationPlan;
  const toolOutputs: ToolOutputs = {};
  let report: AgentReport | null = null;
  let errorMessage: string | undefined;

  try {
    // Step 1 — Normalize.
    await setStatus("normalizing");
    const normalized = normalizeForDisplay(input.address);
    const jurisdiction = input.jurisdiction ?? detectJurisdiction(normalized);
    property = {
      rawAddress: input.address,
      normalizedAddress: normalized,
      jurisdiction,
      parcelId: null,
      yearBuilt: null,
      squareFeet: null,
      propertyType: null,
      lastSaleDate: null,
      lastSalePrice: null,
      ownerName: null,
      isInvestorOwned: null,
    };
    await events.log("step_completed", "normalizing", {
      normalized,
      jurisdiction,
    });

    // Step 2 — Property records / parcel resolution.
    await setStatus("gathering");
    const propData = await fetchProperty(normalized);
    if (propData) {
      property = {
        ...property,
        yearBuilt: propData.yearBuilt,
        squareFeet: propData.sqft,
        propertyType: propData.propertyType,
        lastSaleDate: propData.lastSaleDate,
        lastSalePrice: propData.lastSalePrice,
        ownerName: propData.ownerName,
        isInvestorOwned: propData.isInvestorOwned,
      };
    }
    await events.log("step_completed", "property_resolution", {
      propertyResolved: !!propData,
    });

    // Step 3 — Planning LLM call.
    await events.log("step_started", "planning");
    await events.log("llm_called", "planning", { model: planningModel });
    const planResp = await llm({
      model: planningModel,
      systemPrompt: PLANNING_SYSTEM_PROMPT,
      userPrompt: buildPlanningUserPrompt(property, intent),
      maxTokens: 1000,
    });
    accrueCost(
      planResp.model,
      planResp.inputTokens,
      planResp.outputTokens,
      "planning"
    );
    const planJson = safeParseJson(planResp.text);
    const planParsed = investigationPlanSchema.safeParse(planJson);
    if (!planParsed.success) {
      events.log("error", "planning", {
        err: "plan JSON invalid, using defaults",
      });
      plan = investigationPlanSchema.parse({});
    } else {
      plan = planParsed.data;
    }
    await events.log("step_completed", "planning", { plan });

    // Step 4 — Parallel tool calls. Uses the plan to pick which to run.
    await events.log("step_started", "tool_calls");
    const baseCtx: ToolContext = { property, events };

    const searchPermitsTool = buildSearchPermitsTool(deps.scrapePermits);
    const getPropertyTool = buildGetPropertyRecordsTool(deps.fetchPropertyData);
    const getViolationsTool = buildGetCodeViolationsTool();
    const getContractorTool = buildGetContractorRecordTool();

    const permitResultPromise = runTool(
      searchPermitsTool,
      {
        address: normalized,
        jurisdiction,
        lookback_years: plan.minimum_permit_lookback_years,
      },
      baseCtx
    );

    const propertyResultPromise = runTool(
      getPropertyTool,
      { address: normalized },
      baseCtx
    );

    const violationsResultPromise = plan.require_violation_check
      ? runTool(getViolationsTool, { address: normalized, jurisdiction }, baseCtx)
      : Promise.resolve({ ok: true as const, output: { violations: [], source: "not_available" as const } });

    const [permitRes, propertyRes, violationsRes] = await Promise.all([
      permitResultPromise,
      propertyResultPromise,
      violationsResultPromise,
    ]);

    const permits: PermitRecord[] =
      permitRes.ok ? permitRes.output.permits : [];
    toolOutputs.search_permits = permitRes.ok
      ? permitRes.output
      : { error: permitRes.error };

    toolOutputs.get_property_records = propertyRes.ok
      ? propertyRes.output
      : { error: propertyRes.error };

    toolOutputs.get_code_violations = violationsRes.ok
      ? violationsRes.output
      : { error: violationsRes.error };

    // Contractor lookups — fan out to every distinct contractor referenced.
    const contractorOutputs: unknown[] = [];
    if (plan.require_contractor_verification) {
      const contractors = new Set<string>();
      for (const p of permits) {
        const maybeName = (p as PermitRecord & { contractor?: string | null }).contractor;
        if (maybeName && maybeName.trim().length > 2) contractors.add(maybeName.trim());
      }
      for (const name of Array.from(contractors).slice(0, 5)) {
        const r = await runTool(
          getContractorTool,
          { business_name: name },
          baseCtx
        );
        contractorOutputs.push(r.ok ? r.output : { error: r.error });
      }
    }
    toolOutputs.get_contractor_record = contractorOutputs;

    // Footprint comparison — deterministic, uses data we've already loaded.
    const footprintTool = buildCompareFootprintTool({
      getProperty: () => propData as PropertyData | null,
      getPermits: () => permits,
    });
    const footprintRes = await runTool(
      footprintTool,
      { parcel_id: property.parcelId },
      baseCtx
    );
    toolOutputs.compare_footprint_to_permits = footprintRes.ok
      ? footprintRes.output
      : { error: footprintRes.error };

    await events.log("step_completed", "tool_calls", {
      permitCount: permits.length,
      propertyResolved: !!propData,
      contractorChecks: contractorOutputs.length,
    });

    // Step 5 — Analysis LLM call.
    await setStatus("analyzing");
    await events.log("llm_called", "analysis", { model: analysisModel });
    const analysisResp = await llm({
      model: analysisModel,
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userPrompt: buildAnalysisUserPrompt({
        facts: property,
        permits,
        permitsTruncated: permitRes.ok ? permitRes.output.truncated : false,
        usedFuzzyMatch: permitRes.ok ? permitRes.output.usedFuzzyMatch : false,
        violations: violationsRes.ok ? violationsRes.output.violations ?? [] : [],
        violationsSource: violationsRes.ok
          ? violationsRes.output.source
          : "not_available",
        contractorLookups: (contractorOutputs as Array<{
          source?: string;
          license_status?: string;
          business_name?: string | null;
        }>).map((c) => ({
          source: c.source ?? "unknown",
          license_status: c.license_status ?? "unknown",
          business_name: c.business_name ?? null,
        })),
        footprint: footprintRes.ok ? footprintRes.output : null,
      }),
      maxTokens: 4000,
    });
    accrueCost(
      analysisResp.model,
      analysisResp.inputTokens,
      analysisResp.outputTokens,
      "analysis"
    );

    const analysisJson = safeParseJson(analysisResp.text);
    const parsed = agentReportSchema.safeParse(analysisJson);
    if (!parsed.success) {
      errorMessage = `analysis JSON invalid: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
      await events.log("step_failed", "analysis", { err: errorMessage });
      status = "failed";
    } else {
      report = parsed.data;
      await events.log("step_completed", "analysis", {
        riskLevel: report.risk_level,
        redFlagCount: report.red_flags.length,
      });
      status = "complete";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    status = "failed";
    await events.log("error", "run", { err: errorMessage });
    property = {
      rawAddress: input.address,
      normalizedAddress: normalizeForDisplay(input.address),
      jurisdiction: input.jurisdiction ?? "ATLANTA_GA",
      parcelId: null,
      yearBuilt: null,
      squareFeet: null,
      propertyType: null,
      lastSaleDate: null,
      lastSalePrice: null,
      ownerName: null,
      isInvestorOwned: null,
    };
    plan = investigationPlanSchema.parse({});
  }

  const durationSeconds = (Date.now() - startedAt) / 1000;

  // Persist final state if we have a reportId + supabase.
  if (supabase && input.reportId) {
    try {
      await supabase
        .from("agent_reports")
        .update({
          status,
          completed_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          llm_cost_usd: totalCost,
          plan_json: plan,
          tool_outputs_json: toolOutputs,
          report_json: report,
          error_message: errorMessage ?? null,
          normalized_address: property.normalizedAddress,
          jurisdiction: property.jurisdiction,
        })
        .eq("id", input.reportId);
    } catch (err) {
      await events.log("error", "persist_final", { err: String(err) });
    }
  }

  return {
    reportId: input.reportId ?? null,
    status,
    durationSeconds,
    llmCostUsd: totalCost,
    property,
    plan,
    toolOutputs,
    report,
    error: errorMessage,
  };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return null;
  }
}

/**
 * Helper for server routes: create a new agent_reports row and return its id.
 * Can be omitted in CLI usage — runAgent accepts reportId: null.
 */
export async function createAgentReportRow(
  supabase: SupabaseClient,
  args: {
    userId: string | null;
    rawAddress: string;
    intent: AgentIntent;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_reports")
    .insert({
      user_id: args.userId,
      raw_address: args.rawAddress,
      intent: args.intent,
      status: "pending",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create agent_reports row: ${error?.message}`);
  }
  return data.id as string;
}
