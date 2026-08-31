/**
 * Minimal className joiner — avoids pulling in clsx/tailwind-merge as new
 * dependencies for what the design system needs (conditional class lists,
 * no conflicting-utility resolution required given how the components below
 * compose classes).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
