import { describe, expect, it } from "vitest";
import type { Snapshot } from "@patchwork/protocol";
import { applyEventsToStats, applySnapshotToStats, createRunStats } from "./runStats";

describe("run stats", () => {
  it("tallies kill and repair events without mutating the previous stats", () => {
    const stats = createRunStats();
    const next = applyEventsToStats(stats, [
      { type: "enemy_killed", enemyId: "e1", x: 1, y: 2 },
      { type: "tile_repaired", col: 1, row: 1 },
      { type: "enemy_hit", enemyId: "e2", damage: 3, x: 0, y: 0 }
    ]);

    expect(next.enemiesSunk).toBe(1);
    expect(next.tilesRepaired).toBe(1);
    expect(stats.enemiesSunk).toBe(0);
  });

  it("keeps max wave reached and latest final currencies from snapshots", () => {
    const stats = applySnapshotToStats(createRunStats(), snapshot(4, 9, 12), "p1");
    const next = applySnapshotToStats(stats, snapshot(2, 5, 8), "p1");

    expect(next.wavesReached).toBe(4);
    expect(next.finalCoins).toBe(5);
    expect(next.finalSalvage).toBe(8);
  });
});

function snapshot(wave: number, coins: number, salvage: number): Snapshot {
  return {
    tick: wave,
    players: [
      {
        id: "p1",
        x: 0,
        y: 0,
        hp: 10,
        maxHp: 10,
        facingX: 1,
        facingY: 0,
        downed: false,
        weaponIds: [],
        coins
      }
    ],
    enemies: [],
    projectiles: [],
    pickups: [],
    wave: { number: wave, phase: "combat", timeLeft: 0 },
    salvage
  };
}
