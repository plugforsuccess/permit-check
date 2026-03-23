import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { config } from "@/lib/config";
import { hasAgentAccess } from "@/lib/subscription";
import { z } from "zod";

const schema = z.object({
  agent_name: z.string().min(1).max(100).optional(),
  brokerage: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Save agent profile before redirecting to Stripe
    await supabase.from("users").upsert({
      id: user.id,
      email: user.email!,
      agent_name: parsed.data.agent_name ?? null,
      brokerage: parsed.data.brokerage ?? null,
    });

    // Prevent duplicate subscriptions
    const { data: existing } = await supabase
      .from("users")
      .select("subscription_status")
      .eq("id", user.id)
      .single();

    if (existing && hasAgentAccess(existing.subscription_status)) {
      return NextResponse.json(
        { error: "You already have an active Agent Plan subscription." },
        { status: 409 }
      );
    }

    const priceId = process.env.STRIPE_AGENT_PLAN_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Agent plan not configured" },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.app.baseUrl}/dashboard?subscription=success`,
      cancel_url: `${config.app.baseUrl}/#pricing`,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    });

    return NextResponse.json({ checkout_url: session.url });
  } catch (err) {
    console.error("Subscription checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}
