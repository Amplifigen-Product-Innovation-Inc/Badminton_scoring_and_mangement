import { LogoutButton } from "@/components/auth/logout-button";

/**
 * Minimal scorer chrome — mobile-first (§54), so this is a single thin bar
 * with just a logout affordance, not a full nav (there's nothing else for
 * a scorer to navigate to: their assigned match is the whole screen).
 */
export default function ScorerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-surface-border bg-surface px-4 py-2.5">
        <span className="text-sm font-semibold text-brand-700">Badminton Scorer</span>
        <LogoutButton className="text-sm text-neutral-500 hover:text-neutral-900" />
      </header>
      {children}
    </div>
  );
}
