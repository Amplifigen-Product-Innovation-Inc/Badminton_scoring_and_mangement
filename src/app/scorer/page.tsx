import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Placeholder scorer landing page. Real "assigned court" view is Phase 5.1
 * (TASKS.md) — the highest-priority screen in the whole app per spec §23/§55.
 */
export default async function ScorerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold text-neutral-900">Your assigned court</h1>
      <p className="mt-2 text-neutral-500">
        Live scoring UI lands here in Phase 5 (see TASKS.md).
      </p>
    </main>
  );
}
