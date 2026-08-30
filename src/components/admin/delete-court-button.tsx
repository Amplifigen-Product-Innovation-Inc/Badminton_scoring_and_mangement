"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCourt } from "@/app/admin/courts/actions";

export function DeleteCourtButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete court "${name}"?`)) return;
    startTransition(async () => {
      const res = await deleteCourt(id);
      if (res.status === "error") alert(res.message);
      else router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      Delete
    </button>
  );
}
