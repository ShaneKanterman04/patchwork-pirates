import { describe, expect, it } from "vitest";

import {
  TICK_RATE,
  addPlayer,
  createWorld,
  tick,
  updateHazards
} from "./index";
import type {
  ContentRegistry,
  EnemyState,
  HazardState,
  PlayerInput,
  Vec2,
  WeaponDef,
  WorldState
} from "./index";

const LEAKY_BUCKET: WeaponDef = {
  id: "leaky_bucket",
  name: "Leaky Bucket",
  shopPrice: 14,
  targeting: "nearest",
  cooldownS: 0.9,
  rangeTiles: 0.8,
  damage: 6,
  pattern: {
    kind: "trail",
    puddleRadius: 0.8,
    puddleTtlS: 4,
    slowFactor: 0.55,
    dps: 6,
    minMoveTiles: 0.5
  }
};

const CRAB_TRAP: WeaponDef = {
  id: "crab_trap",
  name: "Crab Trap",
  shopPrice: 16,
  targeting: "nearest",
  cooldownS: 3,
  rangeTiles: 0.5,
  damage: 45,
  pattern: {
    kind: "trap",
    trapRadius: 0.5,
    trapDamage: 45,
    rootS: 0.8,
    maxActive: 3
  }
};

const TEST_CONTENT: ContentRegistry = {
  weapons: { leaky_bucket: LEAKY_BUCKET, crab_trap: CRAB_TRAP },
  characters: {},
  items: {},
  enemies: {
    chum: {
      id: "chum",
      name: "Chum",
      maxHp: 100,
      speedTilesPerSec: 2,
      contactDamage: 6,
      contactCooldownS: 0.6,
      radius: 0.3,
      coinValue: 1,
      behavior: { kind: "swarmer_melee" }
    }
  },
  modules: {},
  waves: []
};

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const RIGHT_INPUT: PlayerInput = {
  movement: { x: 1, y: 0 },
  dash: false,
  interact: false
};

describe("ground hazards", () => {
  it("puddle drops only after moving, damages and slows inside enemies, then expires", () => {
    const world = createWorld(1, TEST_CONTENT);
    addPlayer(world, "p1", ["leaky_bucket"]);

    tick(world, new Map([["p1", IDLE_INPUT]]));
    expect(world.hazards).toEqual([]);

    for (let i = 0; i < Math.round(LEAKY_BUCKET.cooldownS * TICK_RATE); i += 1) {
      tick(world, new Map([["p1", RIGHT_INPUT]]));
    }

    expect(world.hazards).toHaveLength(1);
    const puddle = world.hazards[0] as HazardState;
    expect(puddle).toMatchObject({
      kind: "puddle",
      ownerId: "p1",
      radius: 0.8,
      damage: 6,
      slowFactor: 0.55
    });

    const enemy = addEnemy(world, "e1", { ...puddle.pos });
    const hpBefore = enemy.hp;
    updateHazards(world);

    expect(enemy.hp).toBeCloseTo(hpBefore - 6 / TICK_RATE);
    expect(enemy.slowFactor).toBe(0.55);
    expect(enemy.slowTicks).toBe(Math.round(0.3 * TICK_RATE));

    for (let i = 0; i < Math.round(4 * TICK_RATE); i += 1) {
      updateHazards(world);
    }

    expect(world.hazards).toEqual([]);
  });

  it("trap triggers once on the first enemy, roots it, emits an event, and disappears", () => {
    const world = createWorld(2, TEST_CONTENT);
    addPlayer(world, "p1");
    world.hazards.push(trap("h1", { x: 1, y: 1 }));
    const enemy = addEnemy(world, "e1", { x: 1.2, y: 1 });

    updateHazards(world);

    expect(enemy.hp).toBe(55);
    expect(enemy.slowFactor).toBe(0);
    expect(enemy.slowTicks).toBe(Math.round(0.8 * TICK_RATE));
    expect(world.hazards).toEqual([]);
    expect(world.events).toContainEqual({
      type: "trap_triggered",
      x: 1,
      y: 1
    });
    expect(
      world.events.filter((event) => event.type === "enemy_hit")
    ).toHaveLength(1);
  });

  it("trap maxActive replaces the oldest and outside enemies do not trigger", () => {
    const world = createWorld(3, TEST_CONTENT);
    const player = addPlayer(world, "p1", ["crab_trap"]);

    for (let i = 0; i < 4; i += 1) {
      player.pos = { x: 0.5 + i, y: 1.5 };
      const weapon = player.weapons[0];
      if (weapon !== undefined) {
        weapon.cooldownTicks = 0;
      }
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(world.hazards.map((hazard) => hazard.id)).toEqual(["h2", "h3", "h4"]);
    expect(world.hazards.map((hazard) => hazard.pos.x)).toEqual([1.5, 2.5, 3.5]);

    addEnemy(world, "far", { x: 10, y: 10 });
    updateHazards(world);
    expect(world.hazards).toHaveLength(3);
    expect(world.events.some((event) => event.type === "trap_triggered")).toBe(false);
  });

  it("trail weapon drops no puddle while the wielder stands still", () => {
    const world = createWorld(4, TEST_CONTENT);
    addPlayer(world, "p1", ["leaky_bucket"]);

    for (let i = 0; i < Math.round(3 * TICK_RATE); i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(world.hazards).toEqual([]);
  });

  it("produces deterministic hazard arrays for identical worlds and inputs", () => {
    const first = createWorld(5, TEST_CONTENT);
    const second = createWorld(5, TEST_CONTENT);
    addPlayer(first, "p1", ["leaky_bucket", "crab_trap"]);
    addPlayer(second, "p1", ["leaky_bucket", "crab_trap"]);

    for (let i = 0; i < 100; i += 1) {
      const input = i < 45 ? RIGHT_INPUT : IDLE_INPUT;
      tick(first, new Map([["p1", input]]));
      tick(second, new Map([["p1", input]]));
    }

    expect(second.hazards).toEqual(first.hazards);
  });
});

function trap(id: string, pos: Vec2): HazardState {
  return {
    id,
    kind: "trap",
    ownerId: "p1",
    pos,
    radius: 0.5,
    ttlTicks: 60 * TICK_RATE,
    damage: 45,
    slowFactor: 0,
    slowDurationTicks: Math.round(0.8 * TICK_RATE)
  };
}

function addEnemy(world: WorldState, id: string, pos: Vec2): EnemyState {
  const enemy: EnemyState = {
    id,
    type: "chum",
    pos,
    hp: 100,
    maxHp: 100,
    radius: 0.3,
    speed: 2,
    contactDamage: 6,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(0.6 * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0
  };
  world.enemies.push(enemy);
  return enemy;
}
