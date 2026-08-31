import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * §50 — admin settings. Dark mode was tried and pulled: the neutral color
 * scale wasn't wired for it consistently across every hand-styled screen
 * (some used the flipping semantic tokens, some hardcoded bg-white/
 * text-neutral-900), so switching produced unreadable dark-on-dark text in
 * places. Reverted to light-only until it's redone properly rather than
 * ship a half-working toggle. Nothing else is configurable yet either
 * (§52: don't over-design ahead of a real need).
 */
export default async function AdminSettingsPage() {
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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>

      <div className="mt-6">
        <EmptyState
          title="Nothing to configure yet"
          description="Settings land here as they're needed."
        />
      </div>
    </main>
  );
}
