#!/usr/bin/env -S tsx
/**
 * CLI runner for the agent.
 *
 *   ANTHROPIC_API_KEY=... pnpm agent:run "1278 Greenwich St SW" flip
 *
 * If SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL are set,
 * the run is persisted to `agent_reports` with a full `report_events` trail.
 * Otherwise the run is stdout-only.
 */
import { createClient } from "@supabase/supabase-js";
import { createAgentReportRow, runAgent } from "./orchestrator";
import type { AgentIntent } from "./types";

const VALID_INTENTS: AgentIntent[] = ["flip", "rental", "primary_residence", "portfolio_hold"];

async function main() {
  const args = process.argv.slice(2);
  const address = args[0];
  const intent = (args[1] as AgentIntent) ?? "flip";

  if (!address) {
    console.error("Usage: tsx src/lib/agent/run.ts <address> [intent]");
    process.exit(2);
  }
  if (!VALID_INTENTS.includes(intent)) {
    console.error(`intent must be one of: ${VALID_INTENTS.join(", ")}`);
    process.exit(2);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  let reportId: string | null = null;
  if (supabase) {
    reportId = await createAgentReportRow(supabase, {
      userId: null,
      rawAddress: address,
      intent,
    });
    console.error(`[agent] created agent_reports row ${reportId}`);
  } else {
    console.error("[agent] supabase env not set — running without persistence");
  }

  const result = await runAgent(
    { address, intent, reportId, userId: null },
    { supabase }
  );

  console.log(
    JSON.stringify(
      {
        reportId: result.reportId,
        status: result.status,
        durationSeconds: result.durationSeconds,
        llmCostUsd: Number(result.llmCostUsd.toFixed(4)),
        property: result.property,
        plan: result.plan,
        report: result.report,
        error: result.error,
      },
      null,
      2
    )
  );

  if (result.status !== "complete") process.exit(1);
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
