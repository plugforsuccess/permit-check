import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { z } from "zod";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";

const schema = z.object({
  user_role: z.enum(["investor", "wholesaler", "flipper", "agent", "attorney", "other"]).optional(),
  deal_volume: z.enum(["1_5", "6_15", "16_plus"]).optional(),
  agent_name: z.string().max(100).optional(),
  brokerage: z.string().max(100).optional(),
});

/**
 * POST /api/user/onboarding
 * Saves onboarding profile and marks onboarding as complete.
 */
export async function POST(request: NextRequest) {
  const ip = extractClientIp(request);
  const allowed = await rateLimit(`onboarding:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      user_role: parsed.data.user_role ?? null,
      deal_volume: parsed.data.deal_volume ?? null,
      agent_name: parsed.data.agent_name ?? null,
      brokerage: parsed.data.brokerage ?? null,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
