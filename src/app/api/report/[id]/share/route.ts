import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { randomBytes } from "crypto";
import { config } from "@/lib/config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lookupId } = await params;
  const supabase = createServerClient();

  // Verify the lookup is paid
  const { data: lookup } = await supabase
    .from("lookups")
    .select("id, payment_status, address_normalized")
    .eq("id", lookupId)
    .single();

  if (!lookup || lookup.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Report not found or not paid" },
      { status: 404 }
    );
  }

  // Get or create share token
  const { data: report } = await supabase
    .from("reports")
    .select("id, share_token, share_expires_at")
    .eq("lookup_id", lookupId)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // If share token exists and not expired, return it
  if (
    report.share_token &&
    report.share_expires_at &&
    new Date(report.share_expires_at) > new Date()
  ) {
    return NextResponse.json({
      share_url: `${config.app.baseUrl}/shared/${report.share_token}`,
      expires_at: report.share_expires_at,
    });
  }

  // Generate new share token — expires in 7 days
  const shareToken = randomBytes(24).toString("hex");
  const shareExpiresAt = new Date();
  shareExpiresAt.setDate(shareExpiresAt.getDate() + 7);

  await supabase
    .from("reports")
    .update({
      share_token: shareToken,
      share_expires_at: shareExpiresAt.toISOString(),
    })
    .eq("id", report.id);

  return NextResponse.json({
    share_url: `${config.app.baseUrl}/shared/${shareToken}`,
    expires_at: shareExpiresAt.toISOString(),
  });
}
