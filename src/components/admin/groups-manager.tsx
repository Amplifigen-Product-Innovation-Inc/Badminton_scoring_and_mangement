"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlayerToGroup,
  createGroup,
  deleteGroup,
  removePlayerFromGroup,
} from "@/app/admin/tournaments/group-actions";

type GroupPlayer = { id: string; name: string };
type Group = { id: string; name: string; category: string | null; players: GroupPlayer[] };
type Stage = { id: string; name: string; stage_type: string; groups: Group[] };
type RosterPlayer = { id: string; name: string };

/** §12/§48 Groups: per-stage group CRUD + player assignment, sourced from
 * the tournament's existing player roster (3.3). */
export function GroupsManager({
  tournamentId,
  stages,
  roster,
}: {
  tournamentId: string;
  stages: Stage[];
  roster: RosterPlayer[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreateGroup(stageId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const input = { name: formData.get("name"), category: formData.get("category") };

    startTransition(async () => {
      const res = await createGroup(stageId, tournamentId, input);
      if (res.status === "ok") {
        form.reset();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDeleteGroup(group: Group) {
    if (!confirm(`Delete group "${group.name}"? This removes its player assignments too.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteGroup(group.id, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleAddPlayer(groupId: string, playerId: string) {
    if (!playerId) return;
    startTransition(async () => {
      const res = await addPlayerToGroup(groupId, playerId, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  function handleRemovePlayer(groupId: string, playerId: string) {
    startTransition(async () => {
      const res = await removePlayerFromGroup(groupId, playerId, tournamentId);
      if (res.status === "error") setError(res.message);
      else router.refresh();
    });
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Groups</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Add a stage first (above) before creating groups within it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Groups</h2>

      <div className="mt-4 space-y-6">
        {stages.map((stage) => {
          const availableForStage = (group: Group) => {
            const inGroup = new Set(group.players.map((p) => p.id));
            return roster.filter((p) => !inGroup.has(p.id));
          };

          return (
            <div key={stage.id} className="rounded-lg border border-neutral-100 p-4">
              <p className="text-sm font-medium text-neutral-900">
                {stage.name}{" "}
                <span className="font-normal text-neutral-400">({stage.stage_type})</span>
              </p>

              <div className="mt-3 space-y-3">
                {stage.groups.length === 0 && (
                  <p className="text-sm text-neutral-400">No groups in this stage yet.</p>
                )}
                {stage.groups.map((group) => (
                  <div key={group.id} className="rounded-lg border border-neutral-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-neutral-900">
                        {group.name}
                        {group.category && (
                          <span className="ml-2 text-xs font-normal text-neutral-400">
                            {group.category}
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="mt-2 space-y-1">
                      {group.players.length === 0 && (
                        <p className="text-sm text-neutral-400">No players assigned yet.</p>
                      )}
                      {group.players.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span className="text-neutral-800">{p.name}</span>
                          <button
                            onClick={() => handleRemovePlayer(group.id, p.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    {availableForStage(group).length > 0 && (
                      <select
                        defaultValue=""
                        disabled={isPending}
                        onChange={(e) => {
                          handleAddPlayer(group.id, e.target.value);
                          e.target.value = "";
                        }}
                        className="mt-2 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
                      >
                        <option value="" disabled>
                          + Assign a player…
                        </option>
                        {availableForStage(group).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => handleCreateGroup(stage.id, e)}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <input
                  name="name"
                  required
                  placeholder="Group name (e.g. Group A)"
                  className="min-w-[140px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
                <input
                  name="category"
                  placeholder="Category (optional)"
                  className="min-w-[120px] rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  + Add Group
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
