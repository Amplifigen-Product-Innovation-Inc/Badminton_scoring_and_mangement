"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Password-based login (§70 addendum). Admin accounts are provisioned directly;
 * scorer accounts are provisioned by admin invite (Supabase invite-by-email —
 * see TASKS.md Phase 2), so there is no public sign-up form here on purpose.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "forgot">("password");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      setStatus("error");
      setErrorMessage("Incorrect email or password.");
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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setStatus(error ? "error" : "sent");
    if (error) setErrorMessage("Something went wrong. Try again.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm" padding="lg">
        <h1 className="text-xl font-semibold text-neutral-900">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === "password"
            ? "Enter your email and password."
            : "We'll email you a link to reset your password."}
        </p>

        {mode === "forgot" && status === "sent" ? (
          <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Check your inbox for a password reset link.
          </p>
        ) : (
          <form
            onSubmit={mode === "password" ? handleSignIn : handleForgotPassword}
            className="mt-6 space-y-4"
          >
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
            />
            {mode === "password" && (
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
              />
            )}
            <Button type="submit" disabled={status === "loading"} size="lg" className="w-full">
              {status === "loading"
                ? "Please wait…"
                : mode === "password"
                  ? "Sign in"
                  : "Send reset link"}
            </Button>
            {status === "error" && errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "password" ? "forgot" : "password");
            setStatus("idle");
            setErrorMessage(null);
          }}
          className="mt-4 text-sm text-neutral-500 underline underline-offset-2"
        >
          {mode === "password" ? "Forgot your password?" : "Back to sign in"}
        </button>
      </Card>
    </main>
  );
}
