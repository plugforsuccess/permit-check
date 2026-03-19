import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { fetchPermits } from "@/lib/accela";
import { normalizeAddress, validateAddress } from "@/lib/address";
import { config } from "@/lib/config";
import type { LookupInitiateRequest } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body: LookupInitiateRequest = await request.json();
    const { address, report_type = "standard" } = body;

    // Validate address
    const validation = validateAddress(address);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const addressNormalized = normalizeAddress(address);

    // Fetch permits to get count (this is cached, so subsequent calls are fast)
    const permitResult = await fetchPermits(address);

    // Create lookup record in database
    const supabase = createServerClient();
    const { data: lookup, error: lookupError } = await supabase
      .from("lookups")
      .insert({
        address_raw: address,
        address_normalized: addressNormalized,
        permit_count: permitResult.total_count,
        payment_status: "pending",
        report_type,
      })
      .select()
      .single();

    if (lookupError) {
      console.error("Failed to create lookup:", lookupError);
      return NextResponse.json(
        { error: "Failed to initiate lookup" },
        { status: 500 }
      );
    }

    // Store permits (they'll be revealed after payment)
    if (permitResult.permits.length > 0) {
      const permitsToInsert = permitResult.permits.map((p) => ({
        ...p,
        lookup_id: lookup.id,
      }));

      const { error: permitError } = await supabase
        .from("permits")
        .insert(permitsToInsert);

      if (permitError) {
        console.error("Failed to store permits:", permitError);
      }
    }

    // Create Stripe checkout session
    const amount =
      report_type === "attorney"
        ? config.pricing.attorneyReport
        : config.pricing.singleLookup;

    const session = await createCheckoutSession(
      lookup.id,
      amount,
      report_type,
      `${config.app.baseUrl}/results/${lookup.id}?payment=success`,
      `${config.app.baseUrl}?payment=cancelled`
    );

    return NextResponse.json({
      lookup_id: lookup.id,
      address_normalized: addressNormalized,
      permit_count: permitResult.total_count,
      payment_url: session.url,
      client_secret: session.id,
    });
  } catch (error) {
    console.error("Lookup initiation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
