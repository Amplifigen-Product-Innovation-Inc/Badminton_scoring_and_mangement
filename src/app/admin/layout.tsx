import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";

// §6 — only routes that exist get a nav item; a not-yet-built page
// (Categories) stays out of the nav rather than showing a dead link.
// "Scorer" links to the scorer screen itself — useful for an admin who's
// also scoring, or previewing what a scorer sees — not a separate admin
// feature; RLS still scopes it to whatever match is actually assigned to
// the logged-in account.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/matches", label: "Live Courts" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
  { href: "/admin/courts", label: "Courts" },
  { href: "/scorer", label: "Scorer" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * §56 admin navigation. Desktop-first (§54) — a plain horizontal bar that
 * wraps on narrow screens rather than a hamburger menu; the admin surface is
 * explicitly desktop-first per spec, so this stays simple rather than
 * building a full mobile drawer for a screen nobody's expected to score from.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-surface-border bg-surface">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-6 py-3">
          <span className="mr-4 text-sm font-semibold text-brand-700">Badminton Admin</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ))}
          <LogoutButton className="ml-auto rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" />
        </nav>
      </header>
      {children}
    </div>
  );
}
