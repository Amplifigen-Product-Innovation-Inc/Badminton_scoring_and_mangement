"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStage,
  deleteStage,
  moveStage,
  updateStage,
} from "@/app/admin/tournaments/stage-actions";
import { stageStatusValues, stageTypeValues } from "@/lib/validation/stage";

type Stage = {
  id: string;
  name: string;
  stage_type: (typeof stageTypeValues)[number];
  stage_order: number;
  status: (typeof stageStatusValues)[number];
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-neutral-100 text-neutral-600",
  ACTIVE: "bg-success-50 text-success-700",
  COMPLETED: "bg-neutral-100 text-neutral-500",
};

/** §11 stage management: add/edit/delete + reorder within a tournament. */
export function StagesManager({
  tournamentId,
  stages,
}: {
  tournamentId: string;
  stages: Stage[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    const formData = new FormData(e.currentTarget);
    const input = { name: formData.get("name"), stage_type: formData.get("stage_type") };

    startTransition(async () => {
      const res = await createStage(tournamentId, input);
      if (res.status === "ok") {
        formRef.current?.reset();
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function handleMove(stageId: string, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveStage(stageId, tournamentId, direction);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  function handleDelete(stage: Stage) {
    if (!confirm(`Delete stage "${stage.name}"? This also removes its groups.`)) return;
    startTransition(async () => {
      const res = await deleteStage(stage.id, tournamentId);
      if (res.status === "error") setError(true);
      else router.refresh();
    });
  }

  function handleEditSubmit(stage: Stage, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    const formData = new FormData(e.currentTarget);
    const input = {
      name: formData.get("name"),
      stage_type: formData.get("stage_type"),
      status: formData.get("status"),
    };

    startTransition(async () => {
      const res = await updateStage(stage.id, tournamentId, input);
      if (res.status === "ok") {
        setEditingId(null);
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Stages</h2>

      <div className="mt-4 space-y-2">
        {stages.length === 0 && (
          <p className="text-sm text-neutral-400">No stages yet — add the first one below.</p>
        )}

        {stages.map((stage, i) =>
          editingId === stage.id ? (
            <form
              key={stage.id}
              onSubmit={(e) => handleEditSubmit(stage, e)}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border p-3"
            >
              <input
                name="name"
                defaultValue={stage.name}
                required
                className="min-w-[160px] flex-1 rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              />
              <select
                name="stage_type"
                defaultValue={stage.stage_type}
                className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              >
                {stageTypeValues.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={stage.status}
                className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand-500"
              >
                {stageStatusValues.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-sm text-neutral-400 hover:text-neutral-600"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div
              key={stage.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => handleMove(stage.id, "up")}
                    disabled={isPending || i === 0}
                    className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMove(stage.id, "down")}
                    disabled={isPending || i === stages.length - 1}
                    className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">{stage.name}</p>
                  <p className="text-xs text-neutral-500">{stage.stage_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_STYLES[stage.status]
                  }`}
                >
                  {stage.status}
                </span>
                <button
                  onClick={() => setEditingId(stage.id)}
                  className="text-sm text-neutral-500 hover:text-neutral-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(stage)}
                  className="text-sm text-error-500 hover:text-error-700"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <form ref={formRef} onSubmit={handleAdd} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          placeholder="Stage name (e.g. Group Stage)"
          className="min-w-[180px] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <select
          name="stage_type"
          defaultValue="GROUP"
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {stageTypeValues.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:bg-neutral-300"
        >
          {isPending ? "Adding…" : "+ Add Stage"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-error-500">Something went wrong saving that change. Try again.</p>}
    </div>
  );
}
