import { describe, expect, it } from "vitest";

/**
 * Tooling smoke test only — confirms Vitest + tsconfig-paths are wired correctly.
 * Delete once real tests land in Phase 4 (scoring engine) and Phase 6 (standings).
 */
describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
