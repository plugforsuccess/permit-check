import { NextResponse } from "next/server";
import { scrapeAccelaPermits } from "@/lib/accela/scraper";
import { log } from "@/lib/logger";
import { sendHealthCheckAlert } from "@/lib/health-check-email";

// Vercel Cron — runs daily at 6am ET
export const maxDuration = 120;

// Vercel calls this with a secret header to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

const TEST_CASES = [
  {
    jurisdiction: "ATLANTA_GA",
    streetNumber: "55",
    streetName: "TRINITY AVE SW",
    expectedMinPermits: 1,
    description: "Atlanta City Hall",
  },
  {
    jurisdiction: "GWINNETT_GA",
    streetNumber: "75",
    streetName: "LANGLEY DR",
    expectedMinPermits: 1,
    description: "Gwinnett County Courthouse",
  },
];

export async function GET(request: Request) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{
    jurisdiction: string;
    description: string;
    passed: boolean;
    permitCount: number;
    error?: string;
  }> = [];

  for (const testCase of TEST_CASES) {
    try {
      log.info("Health check: running test", {
        jurisdiction: testCase.jurisdiction,
        address: `${testCase.streetNumber} ${testCase.streetName}`,
      });

      const { permits } = await scrapeAccelaPermits(
        testCase.streetNumber,
        testCase.streetName,
        testCase.jurisdiction
      );

      const passed = permits.length >= testCase.expectedMinPermits;

      results.push({
        jurisdiction: testCase.jurisdiction,
        description: testCase.description,
        passed,
        permitCount: permits.length,
      });

      log.info("Health check: test complete", {
        jurisdiction: testCase.jurisdiction,
        passed,
        count: permits.length,
      });
    } catch (err) {
      results.push({
        jurisdiction: testCase.jurisdiction,
        description: testCase.description,
        passed: false,
        permitCount: 0,
        error: String(err),
      });

      log.error("Health check: test failed", {
        jurisdiction: testCase.jurisdiction,
        error: String(err),
      });
    }
  }

  const allPassed = results.every((r) => r.passed);
  const failures = results.filter((r) => !r.passed);

  if (!allPassed) {
    // Send alert
    try {
      await sendHealthCheckAlert(failures);
      log.error("Health check: FAILED — alert sent", { failures });
    } catch (alertErr) {
      log.error("Health check: failed to send alert", {
        error: String(alertErr),
      });
    }
  } else {
    log.info("Health check: all tests passed", { results });
  }

  return NextResponse.json({
    status: allPassed ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    results,
  });
}
