import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Exchanges the auth code for a session, then routes the
 * user by role (§56 / role-based landing). Auth method (magic link vs
 * password) is an open question flagged in TASKS.md — magic link chosen as
 * the lowest-friction MVP default since players don't need to remember a
 * password to be a scorer for one tournament. Swap this route if the answer
 * is "password" instead.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (profile?.role === "ADMIN") return NextResponse.redirect(`${origin}/admin`);
        if (profile?.role === "SCORER") return NextResponse.redirect(`${origin}/scorer`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
