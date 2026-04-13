import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, extractClientIp } from "@/lib/ratelimit";

const schema = z.object({
  report_type: z.enum(["standard", "attorney"]),
});

/**
 * PATCH /api/lookup/[id]/report-type
 * Updates the report type on an unpaid lookup.
 * Only allowed before payment — cannot downgrade a paid attorney report.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = extractClientIp(request);
    const allowed = await rateLimit(`report-type:${ip}`);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id: lookupId } = await params;
    const raw = await request.json();
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid report type" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify lookup exists and is unpaid
    const { data: lookup, error } = await supabase
      .from("lookups")
      .select("id, payment_status")
      .eq("id", lookupId)
      .single();

    if (error || !lookup) {
      return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
    }

    if (lookup.payment_status === "paid") {
      return NextResponse.json(
        { error: "Cannot change report type after payment" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("lookups")
      .update({ report_type: parsed.data.report_type })
      .eq("id", lookupId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update report type" },
        { status: 500 }
      );
    }

    return NextResponse.json({ report_type: parsed.data.report_type });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
