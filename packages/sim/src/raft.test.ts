import { describe, expect, it } from "vitest";

import {
  CORE_MAX_HP,
  HOLE_REBUILD_RATE,
  PLAYER_REPAIR_RATE,
  TICK_RATE,
  addPlayer,
  createWorld,
  damageTile,
  isHole,
  isWalkable,
  tick,
  tileAt
} from "./index";
import type { PlayerInput } from "./index";

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

describe("damageTile", () => {
  it("breaks a deck tile at 0 hp and emits tile_broken once", () => {
    const world = createWorld(1);
    const tile = tileAt(world.raft, 1, 1);

    damageTile(world, 1, 1, 1000);
    damageTile(world, 1, 1, 1000);

    expect(tile).toMatchObject({ hp: 0, broken: true });
    expect(world.events).toEqual([{ type: "tile_broken", col: 1, row: 1 }]);
  });

  it("destroys the core without marking it broken and emits core_destroyed once", () => {
    const world = createWorld(1);
    const core = tileAt(world.raft, 2, 2);

    damageTile(world, 2, 2, CORE_MAX_HP + 1);
    damageTile(world, 2, 2, CORE_MAX_HP + 1);

    expect(core).toMatchObject({ hp: 0, broken: false, kind: "core" });
    expect(world.coreDestroyed).toBe(true);
    expect(world.events).toEqual([{ type: "core_destroyed" }]);
  });

  it("clamps over-damage at zero", () => {
    const world = createWorld(1);
    const tile = tileAt(world.raft, 0, 0);

    damageTile(world, 0, 0, 125);

    expect(tile?.hp).toBe(0);
  });
});

describe("raft passability", () => {
  it("reports holes and walkable tiles from world coordinates", () => {
    const world = createWorld(1);
    damageTile(world, 1, 1, 1000);

    expect(isHole(world.raft, 1, 1)).toBe(true);
    expect(isWalkable(world.raft, 1.5, 1.5)).toBe(false);
    expect(isWalkable(world.raft, 2.5, 2.5)).toBe(true);
    expect(isWalkable(world.raft, 0.5, 0.5)).toBe(true);
    expect(isWalkable(world.raft, -0.1, 0.5)).toBe(false);
    expect(isHole(world.raft, -1, 0)).toBe(false);
  });
});

describe("hole movement", () => {
  it("blocks a player from entering a hole on that axis", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.9, y: 1.5 };
    player.moveSpeed = 30;
    damageTile(world, 2, 1, 1000);

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 0 }, dash: false, interact: false }]
      ])
    );

    expect(player.pos).toEqual({ x: 1.9, y: 1.5 });
  });

  it("slides along a hole edge by resolving movement per axis", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.9, y: 1.5 };
    player.moveSpeed = 30;
    damageTile(world, 2, 1, 1000);

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 1 }, dash: false, interact: false }]
      ])
    );

    expect(player.pos.x).toBe(1.9);
    expect(player.pos.y).toBeGreaterThan(1.5);
  });

  it("lets a player move off a hole they are already standing on", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.5, y: 1.5 };
    player.moveSpeed = 30;
    damageTile(world, 1, 1, 1000);

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 0 }, dash: false, interact: false }]
      ])
    );

    expect(player.pos.x).toBeGreaterThan(2);
    expect(player.pos.y).toBe(1.5);
  });
});

describe("repair", () => {
  it("repairs damaged tiles at the player repair rate up to max hp", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 10);

    tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));

    expect(tile?.hp).toBeCloseTo(90 + PLAYER_REPAIR_RATE / TICK_RATE);

    for (let i = 0; i < 10; i += 1) {
      tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));
    }

    expect(tile?.hp).toBe(100);
  });

  it("rebuilds holes at the slower rate and emits tile_repaired at full hp", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 1000);
    world.events = [];

    tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));

    expect(tile?.hp).toBeCloseTo(HOLE_REBUILD_RATE / TICK_RATE);
    expect(tile?.broken).toBe(true);
    expect(world.events).toEqual([]);

    while (tile !== undefined && tile.broken) {
      tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));
    }

    expect(tile).toMatchObject({ hp: 100, broken: false });
    expect(world.events).toContainEqual({
      type: "tile_repaired",
      col: 1,
      row: 1
    });
  });

  it("repairs the nearest eligible tile with stable array-order ties", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.5, y: 1.5 };
    const nearest = tileAt(world.raft, 1, 1);
    const tiedFirst = tileAt(world.raft, 1, 0);
    const tiedSecond = tileAt(world.raft, 0, 1);
    damageTile(world, 1, 1, 10);
    damageTile(world, 0, 1, 10);
    damageTile(world, 1, 0, 10);

    tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));

    expect(nearest?.hp).toBeCloseTo(90 + PLAYER_REPAIR_RATE / TICK_RATE);
    expect(tiedFirst?.hp).toBe(90);
    expect(tiedSecond?.hp).toBe(90);

    nearest!.hp = 100;
    tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));

    expect(tiedFirst?.hp).toBeCloseTo(90 + PLAYER_REPAIR_RATE / TICK_RATE);
    expect(tiedSecond?.hp).toBe(90);
  });

  it("does nothing when no damaged tile is in range", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    const tile = tileAt(world.raft, 4, 4);
    damageTile(world, 4, 4, 10);
    world.events = [];

    tick(world, new Map([["p1", { ...IDLE_INPUT, interact: true }]]));

    expect(tile?.hp).toBe(90);
    expect(world.events).toEqual([]);
  });
});
