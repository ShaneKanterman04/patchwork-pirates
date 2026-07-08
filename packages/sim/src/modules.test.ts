import { describe, expect, it } from "vitest";

import {
  BASE_SUPPLY_CAP,
  SUPPLY_CACHE_CAPACITY,
  TICK_RATE,
  addPlayer,
  createWorld,
  damageTile,
  placeModule,
  supplyCapacity,
  tick,
  tileAt,
  updateModules
} from "./index";
import type {
  ContentRegistry,
  EnemyDef,
  EnemyState,
  ModuleDef,
  PlayerInput,
  Vec2,
  WorldState
} from "./index";

const CANNON: ModuleDef = {
  id: "cannon",
  name: "Cannon",
  maxHp: 60,
  salvageCost: 12,
  behavior: {
    kind: "cannon",
    cooldownS: 1,
    rangeTiles: 4,
    damage: 14,
    projectileSpeed: 9
  }
};

const REPAIR_STATION: ModuleDef = {
  id: "repair_station",
  name: "Supply Cache",
  maxHp: 60,
  salvageCost: 10,
  behavior: {
    kind: "supply_cache",
    capacityBonus: SUPPLY_CACHE_CAPACITY
  }
};

const SPIKE_RAIL: ModuleDef = {
  id: "spike_rail",
  name: "Spike Rail",
  maxHp: 45,
  salvageCost: 14,
  behavior: {
    kind: "spike_rail",
    damage: 6,
    rangeTiles: 0.75,
    cooldownS: 0.5
  }
};

const CHUM: EnemyDef = {
  id: "chum",
  name: "Chum",
  maxHp: 50,
  speedTilesPerSec: 0,
  contactDamage: 0,
  contactCooldownS: 1,
  radius: 0.3,
  coinValue: 0,
  behavior: { kind: "swarmer_melee" }
};

const CONTENT: ContentRegistry = {
  weapons: {},
  characters: {},
  items: {},
  enemies: { chum: CHUM },
  modules: {
    cannon: CANNON,
    repair_station: REPAIR_STATION,
    spike_rail: SPIKE_RAIL
  },
  waves: []
};

describe("placeModule", () => {
  it("places a module on an intact deck tile", () => {
    const world = createWorld(1, CONTENT);

    const module = placeModule(world, "cannon", 1, 1);

    expect(module).toMatchObject({
      id: "m1",
      defId: "cannon",
      col: 1,
      row: 1,
      hp: 60,
      maxHp: 60,
      cooldownTicks: 0
    });
    expect(world.modules).toEqual([module]);
  });

  it("rejects invalid placement targets", () => {
    const world = createWorld(1, CONTENT);
    damageTile(world, 0, 0, 10);
    expect(placeModule(world, "cannon", 2, 2)).toBeNull();
    expect(placeModule(world, "cannon", 0, 0)).toBeNull();
    expect(placeModule(world, "cannon", 9, 9)).toBeNull();
    expect(placeModule(world, "missing", 1, 1)).toBeNull();

    const first = placeModule(world, "cannon", 1, 1);
    expect(first).not.toBeNull();
    expect(placeModule(world, "repair_station", 1, 1)).toBeNull();
  });
});

describe("cannon module", () => {
  it("fires a player projectile that damages an enemy in range", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "cannon", 1, 1);
    const enemy = addEnemy(world, "e1", { x: 3.5, y: 1.5 });

    tick(world, new Map());

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]).toMatchObject({
      type: "cannon",
      faction: "player",
      damage: 14,
      tileDamage: 0,
      homing: false,
      landPos: null,
      aoeRadius: 0,
      effect: null,
      ownerId: module?.id
    });
    expect(module?.cooldownTicks).toBe(TICK_RATE);

    while (world.projectiles.length > 0) {
      tick(world, new Map());
    }

    expect(enemy.hp).toBe(36);
  });

  it("idles with no enemy in range", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "cannon", 1, 1);
    addEnemy(world, "e1", { x: 8, y: 1.5 });

    tick(world, new Map());

    expect(world.projectiles).toEqual([]);
    expect(module?.cooldownTicks).toBe(0);
  });

  it("respects cooldown between shots", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "cannon", 1, 1);
    addEnemy(world, "e1", { x: 3.5, y: 1.5 });

    tick(world, new Map());
    expect(world.projectiles).toHaveLength(1);
    world.projectiles = [];

    tick(world, new Map());

    expect(world.projectiles).toEqual([]);
    expect(module?.cooldownTicks).toBe(TICK_RATE - 1);
  });
});

describe("supply cache module", () => {
  it("increases shared supply capacity", () => {
    const world = createWorld(1, CONTENT);
    expect(supplyCapacity(world)).toBe(BASE_SUPPLY_CAP);

    placeModule(world, "repair_station", 1, 1);
    expect(supplyCapacity(world)).toBe(BASE_SUPPLY_CAP + SUPPLY_CACHE_CAPACITY);
  });

  it("does not repair tiles by itself", () => {
    const world = createWorld(1, CONTENT);
    placeModule(world, "repair_station", 1, 1);
    damageTile(world, 1, 2, 3);
    const tile = requiredTile(world, 1, 2);

    for (let i = 0; i < 10; i += 1) {
      tick(world, new Map());
    }

    expect(tile.hp).toBe(7);
  });

  it("clamps supplies when a cache is destroyed", () => {
    const world = createWorld(1, CONTENT);
    placeModule(world, "repair_station", 1, 1);
    world.salvage = BASE_SUPPLY_CAP + SUPPLY_CACHE_CAPACITY;
    damageTile(world, 1, 1, 10);

    tick(world, new Map());

    expect(world.modules).toEqual([]);
    expect(world.salvage).toBe(BASE_SUPPLY_CAP);
  });
});

describe("spike rail module", () => {
  it("damages enemies in boarding range", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "spike_rail", 1, 1);
    const enemy = addEnemy(world, "e1", { x: 2.45, y: 1.5 });

    updateModules(world);

    expect(module).not.toBeNull();
    expect(enemy.hp).toBe(CHUM.maxHp - 6);
    expect(module?.cooldownTicks).toBe(Math.round(0.5 * TICK_RATE));
  });

  it("ignores enemies outside boarding range", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "spike_rail", 1, 1);
    const enemy = addEnemy(world, "e1", { x: 2.6, y: 1.5 });

    updateModules(world);

    expect(enemy.hp).toBe(CHUM.maxHp);
    expect(module?.cooldownTicks).toBe(Math.round(0.5 * TICK_RATE));
  });

  it("respects cooldown between pulses", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "spike_rail", 1, 1);
    const enemy = addEnemy(world, "e1", { x: 2.45, y: 1.5 });

    updateModules(world);
    updateModules(world);

    expect(enemy.hp).toBe(CHUM.maxHp - 6);
    expect(module?.cooldownTicks).toBe(Math.round(0.5 * TICK_RATE) - 1);

    for (let i = 1; i < Math.round(0.5 * TICK_RATE); i += 1) {
      updateModules(world);
    }

    expect(enemy.hp).toBe(CHUM.maxHp - 12);
    expect(module?.cooldownTicks).toBe(Math.round(0.5 * TICK_RATE));
  });
});

describe("module tile coupling", () => {
  it("destroys a module when its tile becomes a hole", () => {
    const world = createWorld(1, CONTENT);
    const module = placeModule(world, "cannon", 1, 1);
    damageTile(world, 1, 1, 10);

    tick(world, new Map());

    expect(module).not.toBeNull();
    expect(world.modules).toEqual([]);
  });
});

describe("module determinism", () => {
  it("replays worlds with modules and enemies deterministically", () => {
    const first = createModuleReplayWorld();
    const second = createModuleReplayWorld();

    for (let i = 0; i < 200; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect({
      players: first.players,
      enemies: first.enemies,
      pickups: first.pickups,
      projectiles: first.projectiles,
      modules: first.modules,
      run: first.run
    }).toEqual({
      players: second.players,
      enemies: second.enemies,
      pickups: second.pickups,
      projectiles: second.projectiles,
      modules: second.modules,
      run: second.run
    });
  });
});

function createModuleReplayWorld(): WorldState {
  const world = createWorld(99, CONTENT);
  addPlayer(world, "p1");
  placeModule(world, "cannon", 1, 1);
  placeModule(world, "repair_station", 3, 3);
  damageTile(world, 3, 4, 5);
  addEnemy(world, "e1", { x: 4.5, y: 1.5 });
  addEnemy(world, "e2", { x: -0.5, y: 3.5 });
  return world;
}

function replayInput(tickIndex: number): Map<string, PlayerInput> {
  const movement =
    tickIndex % 4 === 0
      ? { x: 1, y: 0 }
      : tickIndex % 4 === 1
        ? { x: 0, y: 1 }
        : tickIndex % 4 === 2
          ? { x: -1, y: 0 }
          : { x: 0, y: -1 };

  return new Map([
    [
      "p1",
      {
        movement,
        dash: tickIndex === 7 || tickIndex === 93,
        interact: tickIndex % 17 === 0
      }
    ]
  ]);
}

function addEnemy(world: WorldState, id: string, pos: Vec2): EnemyState {
  const enemy: EnemyState = {
    id,
    type: "chum",
    pos,
    hp: CHUM.maxHp,
    maxHp: CHUM.maxHp,
    radius: CHUM.radius,
    speed: CHUM.speedTilesPerSec,
    contactDamage: CHUM.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(CHUM.contactCooldownS * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0,
    animState: "move" as const,
    attackAnimTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}

function requiredTile(world: WorldState, col: number, row: number) {
  const tile = tileAt(world.raft, col, row);
  if (tile === undefined) {
    throw new Error(`missing tile ${col},${row}`);
  }

  return tile;
}
