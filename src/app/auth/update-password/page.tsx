"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Landing page after a password-reset or invite link. The user arrives here
 * already holding a valid session (exchanged in /auth/callback) and just sets
 * a new password.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    router.push(profile?.role === "ADMIN" ? "/admin" : "/scorer");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Set a new password</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {status === "loading" ? "Saving…" : "Save password"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">Something went wrong. Try again.</p>
          )}
        </form>
      </div>
    </main>
  );
}
