import { describe, expect, it } from "vitest";
import { nextHint } from "./hints";
import type { HintId, HintView } from "./hints";

describe("contextual hints", () => {
  it.each([
    ["move", { inCombat: true }],
    ["dash", { inCombat: true, combatAgeMs: 3_500 }, ["move"]],
    ["repair", { nearDamagedTile: true }],
    ["coins", { coinsIncreased: true }],
    ["expand", { canExpandRaft: true }],
    ["build", { inBuildPhase: true }],
    ["revive", { teammateDowned: true }],
    ["boss", { bossPresent: true }]
  ] satisfies [HintId, Partial<HintView>, string[]?][])(
    "fires %s the first time its condition holds",
    (hintId, overrides, alreadySeen = []) => {
      expect(nextHint(new Set(alreadySeen), view(overrides))).toBe(hintId);
    }
  );

  it("respects seen hints", () => {
    expect(nextHint(new Set(["move"]), view({ inCombat: true }))).toBeNull();
    expect(nextHint(new Set(["repair"]), view({ nearDamagedTile: true }))).toBeNull();
  });

  it("does not show dash until shortly after combat starts", () => {
    expect(nextHint(new Set(["move"]), view({ inCombat: true, combatAgeMs: 3_499 }))).toBeNull();
    expect(nextHint(new Set(["move"]), view({ inCombat: true, combatAgeMs: 3_500 }))).toBe("dash");
  });

  it("uses stable priority when several hints are eligible", () => {
    expect(
      nextHint(
        new Set(),
        view({
          inCombat: true,
          combatAgeMs: 9_000,
          nearDamagedTile: true,
          coinsIncreased: true,
          canExpandRaft: true,
          inBuildPhase: true,
          teammateDowned: true,
          bossPresent: true
        })
      )
    ).toBe("move");

    expect(
      nextHint(
        new Set(["move"]),
        view({
          inCombat: true,
          combatAgeMs: 9_000,
          nearDamagedTile: true,
          coinsIncreased: true,
          canExpandRaft: true,
          teammateDowned: true,
          bossPresent: true
        })
      )
    ).toBe("boss");
  });
});

function view(overrides: Partial<HintView>): HintView {
  return {
    inCombat: false,
    combatAgeMs: 0,
    nearDamagedTile: false,
    coinsIncreased: false,
    inBuildPhase: false,
    canExpandRaft: false,
    teammateDowned: false,
    bossPresent: false,
    ...overrides
  };
}
