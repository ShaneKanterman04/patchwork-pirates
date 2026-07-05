import { describe, expect, it } from "vitest";
import type { RaftView } from "@patchwork/protocol";
import { enemyBobOffset, isEnemyOnDeck } from "./enemyGrounding";

describe("enemy grounding", () => {
  it("treats intact raft tiles as deck under the enemy", () => {
    expect(isEnemyOnDeck(raft(), 0.2, 0.8)).toBe(true);
    expect(isEnemyOnDeck(raft(), 2.4, 0.5)).toBe(true);
  });

  it("treats broken, missing, and undefined raft tiles as water", () => {
    expect(isEnemyOnDeck(raft(), 1.2, 0.1)).toBe(false);
    expect(isEnemyOnDeck(raft(), 0.5, 1.2)).toBe(false);
    expect(isEnemyOnDeck(undefined, 0.2, 0.8)).toBe(false);
  });

  it("keeps bob offsets deterministic and subtle", () => {
    expect(enemyBobOffset("eel-1", 1200)).toBe(enemyBobOffset("eel-1", 1200));
    expect(Math.abs(enemyBobOffset("eel-1", 1200))).toBeLessThanOrEqual(0.025);
  });
});

function raft(): RaftView {
  return {
    width: 3,
    height: 2,
    tiles: [
      { col: 0, row: 0, kind: "deck", hpRatio: 1, broken: false },
      { col: 1, row: 0, kind: "deck", hpRatio: 0, broken: true },
      { col: 2, row: 0, kind: "core", hpRatio: 1, broken: false }
    ]
  };
}
