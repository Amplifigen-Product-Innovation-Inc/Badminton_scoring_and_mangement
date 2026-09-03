import { describe, expect, it } from "vitest";
import { computeCurrentServer } from "./serve";

const t1 = { id: "t1", players: [{ id: "a", name: "A" }] };
const t2 = { id: "t2", players: [{ id: "b", name: "B" }] };

const d1 = {
  id: "t1",
  players: [
    { id: "a1", name: "A1" },
    { id: "a2", name: "A2" },
  ],
};
const d2 = {
  id: "t2",
  players: [
    { id: "b1", name: "B1" },
    { id: "b2", name: "B2" },
  ],
};

describe("computeCurrentServer", () => {
  it("defaults to team1's player at 0-0 with no rallies yet (singles)", () => {
    const state = computeCurrentServer([], t1, t2);
    expect(state.servingTeamId).toBe("t1");
    expect(state.server?.id).toBe("a");
  });

  it("singles: server flips to whoever wins the rally", () => {
    const state = computeCurrentServer([{ winningTeamId: "t1" }, { winningTeamId: "t2" }], t1, t2);
    expect(state.servingTeamId).toBe("t2");
    expect(state.server?.id).toBe("b");
  });

  it("singles: server stays the same across consecutive wins", () => {
    const state = computeCurrentServer(
      [{ winningTeamId: "t1" }, { winningTeamId: "t1" }, { winningTeamId: "t1" }],
      t1,
      t2
    );
    expect(state.servingTeamId).toBe("t1");
    expect(state.server?.id).toBe("a");
  });

  it("doubles: same server continues on consecutive wins, court swaps internally", () => {
    const state = computeCurrentServer(
      [{ winningTeamId: "t1" }, { winningTeamId: "t1" }],
      d1,
      d2
    );
    expect(state.servingTeamId).toBe("t1");
    // team1 score is now 2 (even) -> back to original right-court occupant
    expect(state.server?.id).toBe("a1");
  });

  it("doubles: side-out passes serve to the other team outright, no partner hand-off", () => {
    const state = computeCurrentServer([{ winningTeamId: "t2" }], d1, d2);
    expect(state.servingTeamId).toBe("t2");
    // team2 hasn't scored yet (0, even) -> its first-listed ("right") player
    expect(state.server?.id).toBe("b1");
  });

  it("doubles: receiving team's positions stay frozen until they actually serve", () => {
    // team1 wins once (score 1, odd -> a2 now at right... swap happened),
    // then loses -> side-out to team2, whose positions never moved.
    const state = computeCurrentServer(
      [{ winningTeamId: "t1" }, { winningTeamId: "t2" }],
      d1,
      d2
    );
    expect(state.servingTeamId).toBe("t2");
    expect(state.server?.id).toBe("b1"); // team2 score still 0 (even) -> right = b1, untouched
  });

  it("doubles: server alternates court and identity correctly over a longer sequence", () => {
    const rallies = [
      { winningTeamId: "t1" }, // t1: 1-0, same server a1 continues (positions swap)
      { winningTeamId: "t1" }, // t1: 2-0, same server a1 continues (positions swap back)
      { winningTeamId: "t2" }, // side-out to t2 (t2 hasn't served yet: still [b1, b2])
      { winningTeamId: "t2" }, // t2's first point while serving: b1 (right, score 0) serves and wins
    ];
    const state = computeCurrentServer(rallies, d1, d2);
    expect(state.servingTeamId).toBe("t2");
    // t2 score is now 1 (odd) -> left-court occupant after the swap that
    // just happened is still b1 (same server continues, court swaps).
    expect(state.server?.id).toBe("b1");
  });
});
