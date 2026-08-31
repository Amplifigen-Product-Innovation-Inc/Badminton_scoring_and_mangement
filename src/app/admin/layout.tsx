import Link from "next/link";

// §6 — only routes that exist get a nav item; a not-yet-built page (Scorers,
// Categories, Settings) stays out of the nav rather than showing a dead link.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/matches", label: "Live Courts" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/courts", label: "Courts" },
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
        </nav>
      </header>
      {children}
    </div>
  );
}
