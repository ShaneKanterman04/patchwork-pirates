import { describe, expect, it } from "vitest";

import {
  PLAYER_MOVE_SPEED,
  TICK_RATE,
  addPlayer,
  createWorld,
  selectTarget,
  tick
} from "./index";
import type {
  ContentRegistry,
  EnemyState,
  PlayerInput,
  Vec2,
  WeaponDef,
  WorldState
} from "./index";

const CUTLASS: WeaponDef = {
  id: "cutlass",
  name: "Cutlass",
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 18,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
};

const TEST_CONTENT: ContentRegistry = {
  weapons: { cutlass: CUTLASS },
  enemies: {
    chum: {
      id: "chum",
      name: "Chum",
      maxHp: 18,
      speedTilesPerSec: 2.6,
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

describe("targeting", () => {
  it("returns the closest enemy in range", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    addEnemy(world, "far", { x: player.pos.x + 1.2, y: player.pos.y });
    const near = addEnemy(world, "near", {
      x: player.pos.x + 0.5,
      y: player.pos.y
    });

    expect(selectTarget(world, player, CUTLASS)).toBe(near);
  });

  it("returns null when no enemy is in range", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    addEnemy(world, "far", { x: player.pos.x + 4, y: player.pos.y });

    expect(selectTarget(world, player, CUTLASS)).toBeNull();
  });

  it("breaks equal-distance ties by stable enemy array order", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    const first = addEnemy(world, "b", {
      x: player.pos.x + 1,
      y: player.pos.y
    });
    addEnemy(world, "a", { x: player.pos.x - 1, y: player.pos.y });

    expect(selectTarget(world, player, CUTLASS)).toBe(first);
  });
});

describe("cutlass", () => {
  it("fires off cooldown with an enemy in range", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["cutlass"]);
    const enemy = addEnemy(world, "e1", {
      x: player.pos.x + 1,
      y: player.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(enemy.hp).toBe(0);
    expect(player.weapons[0]?.cooldownTicks).toBe(
      Math.round(CUTLASS.cooldownS * TICK_RATE) - 1
    );
    expect(world.events).toContainEqual({
      type: "weapon_fired",
      wielderId: "p1",
      weaponId: "cutlass",
      origin: { x: 1.5, y: 1.5 },
      dir: { x: 1, y: 0 },
      arcDegrees: 90,
      range: 1.4
    });
  });

  it("does nothing when no enemy is in range", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["cutlass"]);
    const enemy = addEnemy(world, "e1", {
      x: player.pos.x + 4,
      y: player.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(enemy.hp).toBe(18);
    expect(player.weapons[0]?.cooldownTicks).toBe(0);
    expect(world.events).toEqual([]);
  });

  it("hits enemies inside the 90 degree wedge and misses behind or out of range", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["cutlass"]);
    const ahead = addEnemy(world, "ahead", {
      x: player.pos.x + 0.5,
      y: player.pos.y
    });
    const diagonal = addEnemy(world, "diagonal", {
      x: player.pos.x + 0.7,
      y: player.pos.y + 0.4
    });
    const behind = addEnemy(world, "behind", {
      x: player.pos.x - 1,
      y: player.pos.y
    });
    const tooFar = addEnemy(world, "tooFar", {
      x: player.pos.x + 2,
      y: player.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(ahead.hp).toBe(0);
    expect(diagonal.hp).toBe(0);
    expect(behind.hp).toBe(18);
    expect(tooFar.hp).toBe(18);
    expect(
      world.events.filter((event) => event.type === "enemy_hit")
    ).toHaveLength(2);
  });
});

describe("death to coin", () => {
  it("removes dead enemies, drops one coin, and emits enemy_killed", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["cutlass"]);
    addEnemy(world, "e1", { x: player.pos.x + 1, y: player.pos.y });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.enemies).toEqual([]);
    expect(world.pickups).toEqual([
      {
        id: "e1",
        kind: "coin",
        pos: { x: 2.5 - 2.6 / TICK_RATE, y: 1.5 },
        value: 1
      }
    ]);
    expect(world.events).toContainEqual({
      type: "enemy_killed",
      enemyId: "e1",
      pos: { x: 2.5 - 2.6 / TICK_RATE, y: 1.5 }
    });
  });
});

describe("chum steering and contact", () => {
  it("moves toward nearest player and applies contact damage on cooldown", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1");
    const enemy = addEnemy(world, "e1", {
      x: player.pos.x + 0.5,
      y: player.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(enemy.pos.x).toBeLessThan(2);
    expect(player.hp).toBe(94);

    for (let i = 0; i < Math.round(0.6 * TICK_RATE); i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(player.hp).toBe(88);
  });

  it("lets a faster player increase separation while moving away", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const enemy = addEnemy(world, "e1", { x: 0.6, y: 2.5 });
    const startDistance = distance(player.pos, enemy.pos);

    for (let i = 0; i < 5; i += 1) {
      tick(
        world,
        new Map([
          [
            "p1",
            { movement: { x: 1, y: 0 }, dash: false, interact: false }
          ]
        ])
      );
    }

    expect(distance(player.pos, enemy.pos)).toBeGreaterThan(startDistance);
    expect(player.pos.x - 2.5).toBeCloseTo((PLAYER_MOVE_SPEED * 5) / TICK_RATE);
  });
});

describe("spawner", () => {
  it("does not spawn or consume rng without wave content", () => {
    const world = createWorld(123);
    const startRngState = world.rngState;

    for (let i = 0; i < 100; i += 1) {
      tick(world, new Map());
    }

    expect(world.enemies).toEqual([]);
    expect(world.rngState).toBe(startRngState);
  });
});

function addEnemy(world: WorldState, id: string, pos: Vec2): EnemyState {
  const enemy: EnemyState = {
    id,
    type: "chum",
    pos,
    hp: 18,
    maxHp: 18,
    radius: 0.3,
    speed: 2.6,
    contactDamage: 6,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(0.6 * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null
  };

  world.enemies.push(enemy);
  return enemy;
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
