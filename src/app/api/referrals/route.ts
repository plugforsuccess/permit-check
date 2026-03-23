import { NextRequest, NextResponse } from "next/server";
import { getReferralCardsForRisk } from "@/lib/referrals";

/**
 * GET /api/referrals?risk=low|medium|high
 * Returns referral cards appropriate for the given risk level.
 */
export async function GET(request: NextRequest) {
  const risk = request.nextUrl.searchParams.get("risk");

  if (!risk || !["low", "medium", "high"].includes(risk)) {
    return NextResponse.json(
      { error: "Invalid risk level" },
      { status: 400 }
    );
  }

  const cards = getReferralCardsForRisk(risk as "low" | "medium" | "high");

  return NextResponse.json({ cards });
}
