import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

const schema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;

  // Validate UUID format before hitting the database
  if (!UUID_RE.test(lookupId)) {
    return NextResponse.json({ error: "Invalid lookup ID" }, { status: 400 });
  }

  // Rate limit: 5 feedback submissions per minute per lookup
  const allowed = await rateLimit(`feedback:${lookupId}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Verify lookup exists and is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, payment_status")
    .eq("id", lookupId)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Lookup not found or not paid" },
      { status: 404 }
    );
  }

  // Upsert — one feedback per lookup (last rating wins)
  const { error } = await supabase
    .from("summary_feedback")
    .upsert(
      { lookup_id: lookupId, rating: parsed.data.rating },
      { onConflict: "lookup_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
