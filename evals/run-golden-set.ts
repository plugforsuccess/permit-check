#!/usr/bin/env -S tsx
/**
 * Golden-set runner.
 *
 *   pnpm eval                        # run all fixtures
 *   pnpm eval greenwich-st-sw        # run a single fixture by id
 *
 * Flags via env:
 *   REPLAY_ONLY=1      — fail rather than hit live APIs if a fixture has no replay data
 *   VERBOSE=1          — print full agent report on each fixture
 *
 * Exits non-zero if any fixture fails.
 */
import { runAgent, type AgentDeps } from "@/lib/agent";
import type { PermitRecord, ScrapeResult } from "@/lib/accela";
import type { PropertyData } from "@/lib/property-data";
import { evaluateAgentRun, passed } from "./evaluator";
import { loadFixtures, loadFixtureById } from "./loader";
import type { FixtureRunResult, GoldenFixture } from "./types";

function buildDepsForFixture(fixture: GoldenFixture): AgentDeps {
  const replay = fixture.replay;
  const deps: AgentDeps = {};

  if (replay?.permits) {
    const permits = replay.permits.permits as PermitRecord[];
    const replayPermits: ScrapeResult = {
      permits,
      truncated: replay.permits.truncated ?? false,
      usedFuzzyMatch: replay.permits.usedFuzzyMatch ?? false,
    };
    deps.scrapePermits = async () => replayPermits;
  } else if (process.env.REPLAY_ONLY === "1") {
    throw new Error(
      `fixture ${fixture.id} has no replay data but REPLAY_ONLY=1`
    );
  }

  if (replay && "property" in replay) {
    const value = (replay.property ?? null) as PropertyData | null;
    deps.fetchPropertyData = async () => value;
  } else if (process.env.REPLAY_ONLY === "1") {
    deps.fetchPropertyData = async () => null;
  }

  return deps;
}

async function runFixture(fixture: GoldenFixture): Promise<FixtureRunResult> {
  const deps = buildDepsForFixture(fixture);
  let result;
  try {
    result = await runAgent(
      { address: fixture.address, intent: fixture.intent, reportId: null },
      deps
    );
  } catch (err) {
    return {
      fixtureId: fixture.id,
      address: fixture.address,
      intent: fixture.intent,
      durationSeconds: 0,
      llmCostUsd: 0,
      status: "failed",
      checks: [
        {
          name: "agent_run",
          passed: false,
          detail: err instanceof Error ? err.message : String(err),
        },
      ],
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const checks = evaluateAgentRun(fixture, result);
  return {
    fixtureId: fixture.id,
    address: fixture.address,
    intent: fixture.intent,
    durationSeconds: result.durationSeconds,
    llmCostUsd: Number(result.llmCostUsd.toFixed(4)),
    status: result.status,
    checks,
    passed: passed(checks),
    reportSummary: result.report
      ? {
          risk_level: result.report.risk_level,
          red_flag_count: result.report.red_flags.length,
          red_flag_categories: result.report.red_flags.map((r) => r.category),
        }
      : undefined,
    error: result.error,
  };
}

async function main() {
  const targetId = process.argv[2];
  const fixtures = targetId ? [loadFixtureById(targetId)] : loadFixtures();

  if (fixtures.length === 0) {
    console.error("[eval] no fixtures found in evals/golden-set/");
    process.exit(2);
  }

  console.error(`[eval] running ${fixtures.length} fixture(s)`);
  const results: FixtureRunResult[] = [];
  for (const f of fixtures) {
    console.error(`\n[eval] ▶ ${f.id} — ${f.label}`);
    const r = await runFixture(f);
    results.push(r);
    const emoji = r.passed ? "PASS" : "FAIL";
    console.error(`[eval] ${emoji} ${f.id}  ${r.durationSeconds.toFixed(1)}s  $${r.llmCostUsd.toFixed(4)}`);
    for (const c of r.checks) {
      const mark = c.passed ? "  ok" : "  XX";
      console.error(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    if (process.env.VERBOSE === "1" && r.reportSummary) {
      console.error(JSON.stringify(r.reportSummary, null, 2));
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.error(
    `\n[eval] ${results.length - failed.length}/${results.length} passed`
  );

  if (failed.length > 0) {
    console.error("[eval] FAILURES:");
    for (const f of failed) console.error(`  - ${f.fixtureId}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
