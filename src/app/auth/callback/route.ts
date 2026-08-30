import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth link callback (§70 addendum — password auth). Used by:
 *  - password-reset links (`resetPasswordForEmail`, redirects here with
 *    `?next=/auth/update-password`)
 *  - scorer invite links (Supabase invite-by-email, Phase 2) — same `next` pattern
 *
 * Exchanges the code for a session, then either honors `next` (set-password flows)
 * or falls back to the normal role-based landing page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);

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
