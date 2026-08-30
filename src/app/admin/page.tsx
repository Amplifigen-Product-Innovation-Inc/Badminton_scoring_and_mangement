import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Placeholder admin landing page. Real KPI dashboard is Phase 7.1 (TASKS.md).
 * The role check here is a UX convenience, NOT the security boundary — RLS
 * (0002_rls_policies.sql) is what actually stops a SCORER from reading admin
 * data even if they reach this route directly.
 */
export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") redirect("/scorer");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Admin dashboard</h1>
      <p className="mt-2 text-neutral-500">
        KPIs, live court monitor, and navigation land here in Phase 7 (see TASKS.md).
      </p>
    </main>
  );
}
