import { describe, expect, it } from "vitest";

import {
  CORE_MAX_HP,
  DAMAGED_TILE_HP_PER_SUPPLY,
  HOLE_REBUILD_RATE,
  MAX_RAFT_TILES,
  PLAYER_RADIUS,
  PLAYER_REPAIR_RATE,
  TILE_MAX_HP,
  TICK_RATE,
  addPlayer,
  buildTile,
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

describe("buildTile", () => {
  it("builds an edge-adjacent tile during build phase, spends salvage, and emits tile_built", () => {
    const world = createWorld(1);
    world.run.phase = "build";
    world.salvage = 7;

    expect(buildTile(world, 5, 2)).toBe(true);

    expect(world.salvage).toBe(2);
    expect(tileAt(world.raft, 5, 2)).toMatchObject({
      col: 5,
      row: 2,
      hp: TILE_MAX_HP,
      maxHp: TILE_MAX_HP,
      kind: "deck",
      broken: false
    });
    expect(world.events).toEqual([{ type: "tile_built", col: 5, row: 2 }]);
  });

  it("rejects non-adjacent, occupied, combat phase, insufficient salvage, and max tile builds", () => {
    const world = createWorld(1);
    world.run.phase = "build";
    world.salvage = 500;

    expect(buildTile(world, 7, 7)).toBe(false);
    expect(buildTile(world, 0, 0)).toBe(false);

    world.run.phase = "combat";
    expect(buildTile(world, 5, 2)).toBe(false);

    world.run.phase = "build";
    world.salvage = 4;
    expect(buildTile(world, 5, 2)).toBe(false);

    world.salvage = 500;
    for (let col = 5; world.raft.tiles.length < MAX_RAFT_TILES; col += 1) {
      expect(buildTile(world, col, 0)).toBe(true);
    }

    expect(world.raft.tiles).toHaveLength(MAX_RAFT_TILES);
    expect(buildTile(world, 40, 0)).toBe(false);
  });

  it("supports negative-coordinate builds in bounds, lookup, walkability, and movement clamps", () => {
    const world = createWorld(1);
    world.run.phase = "build";
    world.salvage = 5;

    expect(buildTile(world, -1, 2)).toBe(true);
    expect(world.raft).toMatchObject({
      minCol: -1,
      minRow: 0,
      maxCol: 4,
      maxRow: 4,
      width: 6,
      height: 5
    });
    expect(tileAt(world.raft, -1, 2)).toBeDefined();
    expect(isWalkable(world.raft, -0.5, 2.5)).toBe(true);

    const player = addPlayer(world, "p1");
    player.pos = { x: -0.4, y: 2.5 };
    player.moveSpeed = 30;

    tick(
      world,
      new Map([
        ["p1", { movement: { x: -1, y: 0 }, dash: false, interact: false }]
      ])
    );

    expect(player.pos.x).toBe(-1 + PLAYER_RADIUS);
    expect(player.pos.y).toBe(2.5);
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
    world.salvage = 2;
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 2);

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBeCloseTo(TILE_MAX_HP - 2 + PLAYER_REPAIR_RATE / TICK_RATE);
    expect(world.salvage).toBeCloseTo(2 - (PLAYER_REPAIR_RATE / TICK_RATE) / DAMAGED_TILE_HP_PER_SUPPLY);

    for (let i = 0; i < TICK_RATE; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile?.hp).toBeCloseTo(TILE_MAX_HP);
  });

  it("does not repair without supplies", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 2);

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBe(TILE_MAX_HP - 2);
  });

  it("rebuilds holes at the slower rate and emits tile_repaired at full hp", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    world.salvage = 20;
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 1000);
    world.events = [];

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBeCloseTo(HOLE_REBUILD_RATE / TICK_RATE);
    expect(tile?.broken).toBe(true);
    expect(world.events).toEqual([]);

    while (tile !== undefined && tile.broken) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile).toMatchObject({ hp: TILE_MAX_HP, broken: false });
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
    world.salvage = 2;
    const nearest = tileAt(world.raft, 1, 1);
    const tiedFirst = tileAt(world.raft, 1, 0);
    const tiedSecond = tileAt(world.raft, 0, 1);
    damageTile(world, 1, 1, 2);
    damageTile(world, 0, 1, 2);
    damageTile(world, 1, 0, 2);

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(nearest?.hp).toBeCloseTo(TILE_MAX_HP - 2 + PLAYER_REPAIR_RATE / TICK_RATE);
    expect(tiedFirst?.hp).toBe(TILE_MAX_HP - 2);
    expect(tiedSecond?.hp).toBe(TILE_MAX_HP - 2);

    nearest!.hp = TILE_MAX_HP;
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tiedFirst?.hp).toBeCloseTo(TILE_MAX_HP - 2 + PLAYER_REPAIR_RATE / TICK_RATE);
    expect(tiedSecond?.hp).toBe(TILE_MAX_HP - 2);
  });

  it("does nothing when no damaged tile is in range", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    world.salvage = 2;
    const tile = tileAt(world.raft, 4, 4);
    damageTile(world, 4, 4, 2);
    world.events = [];

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBe(TILE_MAX_HP - 2);
    expect(world.events).toEqual([]);
  });
});
