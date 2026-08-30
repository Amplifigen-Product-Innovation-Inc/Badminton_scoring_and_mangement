import { z } from "zod";

/**
 * §5: email is the player identity key. MUST be normalized before every
 * lookup/insert so "AMAN@EMAIL.COM" / "Aman@email.com" / "aman@email.com"
 * all resolve to the same player (§5, §68.7). Call this at every boundary
 * that touches an email — never rely on the DB's CHECK constraint alone,
 * that's a backstop, not the normalization step itself.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const addPlayerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email")
    .transform(normalizeEmail),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export type AddPlayerInput = z.infer<typeof addPlayerSchema>;
