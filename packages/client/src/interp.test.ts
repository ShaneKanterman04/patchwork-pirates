import { describe, expect, it } from "vitest";
import type { Snapshot } from "@patchwork/protocol";
import { interpolate } from "./interp";

describe("interpolate", () => {
  it("renders a single snapshot directly", () => {
    const source = snapshot(1);
    source.hazards = [{ id: "h1", kind: "puddle", x: 2, y: 3, radius: 0.8 }];
    const state = interpolate([{ recvTimeMs: 100, snapshot: source }], 120);

    expect(state.players[0]?.x).toBe(1);
    expect(state.enemies[0]?.x).toBe(3);
    expect(state.pickups[0]?.x).toBe(4);
    expect(state.hazards).toBe(source.hazards);
  });

  it("lerps entities matched by id between bracketing snapshots", () => {
    const older = snapshot(0);
    const newer = snapshot(10);
    newer.hazards = [{ id: "h1", kind: "trap", x: 5, y: 6, radius: 0.5 }];
    const state = interpolate(
      [
        { recvTimeMs: 100, snapshot: older },
        { recvTimeMs: 200, snapshot: newer }
      ],
      150
    );

    expect(state.players[0]?.x).toBe(5);
    expect(state.players[0]?.y).toBe(6);
    expect(state.enemies[0]?.x).toBe(7);
    expect(state.pickups[0]?.x).toBe(8);
    expect(state.hazards).toBe(newer.hazards);
  });

  it("adds new entities at their new position and drops old-only entities", () => {
    const older = snapshot(0);
    older.players.push({
      id: "old",
      x: 50,
      y: 50,
      hp: 1,
      maxHp: 1,
      facingX: 1,
      facingY: 0,
      downed: false,
      weaponIds: []
    });
    const newer = snapshot(10);
    newer.players.push({
      id: "new",
      x: 20,
      y: 30,
      hp: 1,
      maxHp: 1,
      facingX: 1,
      facingY: 0,
      downed: false,
      weaponIds: []
    });

    const state = interpolate(
      [
        { recvTimeMs: 100, snapshot: older },
        { recvTimeMs: 200, snapshot: newer }
      ],
      150
    );

    expect(state.players.find((player) => player.id === "old")).toBeUndefined();
    expect(state.players.find((player) => player.id === "new")?.x).toBe(20);
  });
});

function snapshot(offset: number): Snapshot {
  return {
    tick: offset,
    players: [
      {
        id: "p1",
        x: offset,
        y: offset + 1,
        hp: 90,
        maxHp: 100,
        facingX: 1,
        facingY: 0,
        downed: false,
        weaponIds: ["cutlass"]
      }
    ],
    enemies: [
      {
        id: "e1",
        kind: "chum",
        x: offset + 2,
        y: offset + 3,
        hpRatio: 0.5,
        radius: 0.3
      }
    ],
    projectiles: [],
    pickups: [
      {
        id: "c1",
        kind: "coin",
        x: offset + 3,
        y: offset + 4
      }
    ],
    wave: { number: 1, phase: "combat", timeLeft: 0 }
  };
}
