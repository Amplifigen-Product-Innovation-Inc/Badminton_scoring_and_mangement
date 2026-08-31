import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/** §50 — admin settings. Theme is the only setting so far; everything else
 * (tournament defaults, notification preferences) is deliberately not
 * built ahead of a real need (§52: don't over-design). */
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

      <Card className="mt-6" padding="lg">
        <h2 className="text-sm font-semibold text-neutral-900">Appearance</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Choose how the admin dashboard looks on this device.
        </p>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </Card>
    </main>
  );
}
