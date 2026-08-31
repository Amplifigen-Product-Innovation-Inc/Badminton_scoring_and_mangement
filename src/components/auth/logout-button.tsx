"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Signs the current user out and returns to /login. Shared by admin and
 * scorer — neither had a way to log out at all until now. */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending} className={className}>
      {isPending ? "Signing out…" : "Log out"}
    </button>
  );
}
