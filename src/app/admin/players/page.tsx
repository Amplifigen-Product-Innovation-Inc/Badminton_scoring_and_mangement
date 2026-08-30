import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddPlayerDialog } from "@/components/admin/add-player-dialog";

type Filter = "all" | "new" | "returning";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q = "", filter: rawFilter = "all" } = await searchParams;
  const filter: Filter = rawFilter === "new" || rawFilter === "returning" ? rawFilter : "all";

  const supabase = await createClient();
  let query = supabase.from("player_directory").select("*").order("name");

  if (q.trim()) {
    const term = q.trim();
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (filter !== "all") {
    query = query.eq("is_returning", filter === "returning");
  }

  const { data: players, error } = await query;

  const totalQuery = await supabase.from("player_directory").select("is_returning");
  const total = totalQuery.data?.length ?? 0;
  const returning = totalQuery.data?.filter((p) => p.is_returning).length ?? 0;
  const newCount = total - returning;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Players</h1>
          <div className="mt-2 flex gap-6 text-sm text-neutral-500">
            <span>
              <span className="font-medium text-neutral-900">{total}</span> total
            </span>
            <span>
              <span className="font-medium text-neutral-900">{newCount}</span> new
            </span>
            <span>
              <span className="font-medium text-neutral-900">{returning}</span> returning
            </span>
          </div>
        </div>
        <AddPlayerDialog />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form className="flex-1 min-w-[240px]">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </form>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
          {(["all", "new", "returning"] as const).map((f) => (
            <Link
              key={f}
              href={`/admin/players?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                filter === f
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Tournaments</th>
              <th className="px-4 py-3 font-medium">Matches</th>
              <th className="px-4 py-3 font-medium">Wins</th>
              <th className="px-4 py-3 font-medium">Win %</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">First Joined</th>
              <th className="px-4 py-3 font-medium">Last Played</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {error && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-red-600">
                  {error.message}
                </td>
              </tr>
            )}
            {!error && (players?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-neutral-400">
                  No players found.
                </td>
              </tr>
            )}
            {players?.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 text-neutral-500">{p.email}</td>
                <td className="px-4 py-3">{p.tournaments_played}</td>
                <td className="px-4 py-3">{p.matches_played}</td>
                <td className="px-4 py-3">{p.matches_won}</td>
                <td className="px-4 py-3">{p.win_pct != null ? `${p.win_pct}%` : "—"}</td>
                <td className="px-4 py-3">{p.current_rating}</td>
                <td className="px-4 py-3">{p.current_category ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(p.first_joined)}</td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(p.last_played)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
