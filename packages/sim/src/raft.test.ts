import { describe, expect, it } from "vitest";

import {
  BROKEN_TILE_HP_PER_SUPPLY,
  CORE_MAX_HP,
  DAMAGED_TILE_HP_PER_SUPPLY,
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

  it("downs a standing player on a deck tile when it breaks", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.4, y: 1.6 };

    damageTile(world, 1, 1, 1000);

    expect(player.hp).toBe(0);
    expect(player.downed).toBe(true);
    expect(player.out).toBe(false);
    expect(player.bleedOutTicks).toBeGreaterThan(0);
    expect(world.events).toEqual([
      { type: "tile_broken", col: 1, row: 1 },
      { type: "player_fell", playerId: "p1", pos: { x: 1.4, y: 1.6 } }
    ]);
  });

  it("does not down players away from the broken tile or double-down fallen players", () => {
    const world = createWorld(1);
    const away = addPlayer(world, "away");
    const downed = addPlayer(world, "downed");
    away.pos = { x: 1.4, y: 2.6 };
    downed.pos = { x: 1.4, y: 1.6 };
    downed.hp = 0;
    downed.downed = true;
    downed.bleedOutTicks = 12;

    damageTile(world, 1, 1, 1000);

    expect(away.downed).toBe(false);
    expect(away.hp).toBe(away.maxHp);
    expect(downed.downed).toBe(true);
    expect(downed.bleedOutTicks).toBe(12);
    expect(world.events).toEqual([{ type: "tile_broken", col: 1, row: 1 }]);
  });

  it("routes solo player falling through party-wipe defeat", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.4, y: 1.6 };
    world.run.phase = "combat";

    damageTile(world, 1, 1, 1000);
    tick(world, new Map());

    expect(player.downed).toBe(true);
    expect(world.run.phase).toBe("defeat");
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
      broken: false,
      patched: false
    });
    expect(world.events).toEqual([{ type: "tile_built", col: 5, row: 2 }]);
  });

  it("starts original and newly built tiles as unpatched wood", () => {
    const world = createWorld(1);
    world.run.phase = "build";
    world.salvage = 5;

    expect(world.raft.tiles.every((tile) => tile.patched === false)).toBe(true);
    expect(buildTile(world, 5, 2)).toBe(true);
    expect(tileAt(world.raft, 5, 2)?.patched).toBe(false);
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
    const tile = tileAt(world.raft, 1, 1);
    if (tile === undefined) {
      throw new Error("missing test tile");
    }
    tile.hp = 0;
    tile.broken = true;

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
  it("spends one supply and applies one HP chunk only after the damaged tile threshold", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    world.salvage = 2;
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 2);

    for (let i = 0; i < TICK_RATE - 1; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile?.hp).toBe(TILE_MAX_HP - 2);
    expect(world.salvage).toBe(2);

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBeCloseTo(TILE_MAX_HP);
    expect(world.salvage).toBe(1);
    expect(world.events).toContainEqual({ type: "tile_repaired", col: 1, row: 1 });
  });

  it("lands repeated chunks at the base repair cadence", () => {
    const world = createWorld(1);
    addPlayer(world, "p1");
    world.salvage = 3;
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 8);

    for (let i = 0; i < TICK_RATE; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile?.hp).toBe(TILE_MAX_HP - 4);
    expect(world.salvage).toBe(2);

    for (let i = 0; i < TICK_RATE; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile?.hp).toBe(TILE_MAX_HP);
    expect(world.salvage).toBe(1);
  });

  it("holds repair charge at the threshold without supplies and resumes when salvage arrives", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 2);

    for (let i = 0; i < TICK_RATE + 5; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile?.hp).toBe(TILE_MAX_HP - 2);
    expect(player.repairChargeHp).toBe(DAMAGED_TILE_HP_PER_SUPPLY);

    world.salvage = 1;
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBe(TILE_MAX_HP);
    expect(world.salvage).toBe(0);
    expect(player.repairChargeHp).toBe(0);
  });

  it("rebuilds holes in whole chunks, marks patched at full hp, and emits per chunk", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 1.5 };
    world.salvage = 20;
    const tile = tileAt(world.raft, 1, 1);
    damageTile(world, 1, 1, 1000);
    world.events = [];

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(tile?.hp).toBe(0);
    expect(tile?.broken).toBe(true);
    expect(tile?.patched).toBe(false);
    expect(world.events).toEqual([]);

    let repairEvents = 0;
    while (tile !== undefined && tile.broken) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
      repairEvents += world.events.filter((event) => event.type === "tile_repaired").length;
    }

    expect(tile).toMatchObject({ hp: TILE_MAX_HP, broken: false, patched: true });
    expect(world.salvage).toBe(16);
    expect(repairEvents).toBe(TILE_MAX_HP / BROKEN_TILE_HP_PER_SUPPLY);
  });

  it("keeps patched tiles patched through damage, break, and rebuild", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 1.5 };
    world.salvage = 40;
    const tile = tileAt(world.raft, 1, 1);

    damageTile(world, 1, 1, 1000);
    while (tile !== undefined && tile.broken) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile).toMatchObject({ broken: false, patched: true });

    damageTile(world, 1, 1, 2);
    expect(tile).toMatchObject({ broken: false, patched: true });

    damageTile(world, 1, 1, 1000);
    expect(tile).toMatchObject({ broken: true, patched: true });

    while (tile !== undefined && tile.broken) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile).toMatchObject({ hp: TILE_MAX_HP, broken: false, patched: true });
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

    for (let i = 0; i < TICK_RATE; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(nearest?.hp).toBe(TILE_MAX_HP);
    expect(tiedFirst?.hp).toBe(TILE_MAX_HP - 2);
    expect(tiedSecond?.hp).toBe(TILE_MAX_HP - 2);

    nearest!.hp = TILE_MAX_HP;
    world.salvage = 2;
    for (let i = 0; i < TICK_RATE; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tiedFirst?.hp).toBe(TILE_MAX_HP);
    expect(tiedSecond?.hp).toBe(TILE_MAX_HP - 2);
  });

  it("resets accumulated charge when switching repair targets", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.5, y: 1.5 };
    world.salvage = 2;
    const first = tileAt(world.raft, 1, 1);
    const second = tileAt(world.raft, 1, 0);
    damageTile(world, 1, 1, 2);
    damageTile(world, 1, 0, 2);

    for (let i = 0; i < TICK_RATE / 2; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(first?.hp).toBe(TILE_MAX_HP - 2);
    expect(player.repairChargeHp).toBeCloseTo(PLAYER_REPAIR_RATE / 2);

    first!.hp = TILE_MAX_HP;
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(second?.hp).toBe(TILE_MAX_HP - 2);
    expect(player.repairChargeHp).toBeCloseTo(PLAYER_REPAIR_RATE / TICK_RATE);
    expect(world.salvage).toBe(2);
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
