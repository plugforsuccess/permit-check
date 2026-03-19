import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { registerSchema } from "@/lib/schemas";

/**
 * POST /api/auth/register
 * Creates a user account via Supabase Auth.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = registerSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const supabase = createServerClient();

    // Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    // Create user profile
    const { error: profileError } = await supabase.from("users").insert({
      id: authData.user.id,
      email,
      plan_type: "free",
    });

    if (profileError) {
      console.error("Failed to create user profile:", profileError);
    }

    return NextResponse.json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
