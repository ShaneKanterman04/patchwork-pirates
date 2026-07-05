import { describe, expect, it } from "vitest";

import { TICK_RATE, addPlayer, createWorld, tick } from "./index";
import type {
  ContentRegistry,
  EnemyState,
  PlayerInput,
  Vec2,
  EnemyDef,
  WeaponDef,
  WorldState
} from "./index";

const HARPOON: WeaponDef = {
  id: "harpoon",
  name: "Harpoon",
  targeting: "nearest",
  cooldownS: 1.1,
  rangeTiles: 5,
  damage: 5,
  pattern: {
    kind: "projectile",
    projectileSpeed: 14,
    homing: true,
    effect: "pull_or_slow",
    pullDistance: 2.5,
    slowFactor: 0.5,
    slowDurationS: 1.5
  }
};

const COCONUT: WeaponDef = {
  id: "coconut",
  name: "Coconut",
  targeting: "densest_cluster",
  cooldownS: 1.6,
  rangeTiles: 5,
  damage: 10,
  pattern: { kind: "lob", projectileSpeed: 7, aoeRadius: 1.3 }
};

const CONTENT: ContentRegistry = {
  weapons: { harpoon: HARPOON, coconut: COCONUT },
  enemies: {
    light: enemyDef("light", false),
    heavy: enemyDef("heavy", true)
  }
};

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

describe("harpoon projectile", () => {
  it("firing spawns a homing projectile", () => {
    const world = createWorld(1, CONTENT);
    world.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["harpoon"]);
    addEnemy(world, "e1", "light", { x: player.pos.x + 3, y: player.pos.y });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]).toMatchObject({
      type: "harpoon",
      ownerId: "p1",
      homing: true,
      targetId: "e1",
      effect: "pull_or_slow"
    });
  });

  it("yanks a light enemy toward the wielder and expires after hit", () => {
    const world = createWorld(1, CONTENT);
    world.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["harpoon"]);
    const enemy = addEnemy(world, "e1", "light", {
      x: player.pos.x + 2,
      y: player.pos.y
    });
    const startDistance = distance(player.pos, enemy.pos);

    runUntilNoProjectiles(world);

    expect(distance(player.pos, enemy.pos)).toBeLessThan(startDistance);
    expect(world.projectiles).toEqual([]);
    expect(world.events).toContainEqual({
      type: "enemy_hit",
      enemyId: "e1",
      damage: HARPOON.damage,
      pos: { x: 3.5, y: 1.5 }
    });
  });

  it("slows a heavy enemy and uses reduced movement while slowed", () => {
    const world = createWorld(1, CONTENT);
    world.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["harpoon"]);
    const enemy = addEnemy(world, "e1", "heavy", {
      x: player.pos.x + 2,
      y: player.pos.y
    });

    runUntilNoProjectiles(world);

    expect(enemy.slowTicks).toBeGreaterThan(0);
    expect(enemy.slowFactor).toBe(0.5);
    const beforeSlowMove = { ...enemy.pos };

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(distance(beforeSlowMove, enemy.pos)).toBeCloseTo(
      (enemy.speed * 0.5) / TICK_RATE
    );
  });
});

describe("coconut lob", () => {
  it("spawns a lob at the cluster and explodes for multi-hit damage", () => {
    const world = createWorld(1, CONTENT);
    world.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["coconut"]);
    addEnemy(world, "sparse", "light", { x: player.pos.x + 0.8, y: player.pos.y });
    const center = addEnemy(world, "center", "light", {
      x: player.pos.x + 2,
      y: player.pos.y
    });
    const nearby = addEnemy(world, "nearby", "light", {
      x: center.pos.x + 0.4,
      y: center.pos.y
    });
    const outsideAoe = addEnemy(world, "outside", "light", {
      x: center.pos.x + 2,
      y: center.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]?.landPos).toEqual({ x: 3.5, y: 1.5 });

    while (world.projectiles.length > 0) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(center.hp).toBe(40);
    expect(nearby.hp).toBe(40);
    expect(outsideAoe.hp).toBe(50);
    expect(world.events).toContainEqual({
      type: "explosion",
      pos: { x: 3.5, y: 1.5 },
      radius: 1.3
    });
  });
});

function enemyDef(id: string, heavy: boolean): EnemyDef {
  return {
    id,
    name: id,
    maxHp: 50,
    speedTilesPerSec: 0,
    contactDamage: 0,
    contactCooldownS: 0.6,
    radius: 0.3,
    coinValue: 0,
    heavy,
    basePriority: 0,
    elite: false,
    behavior: { kind: "swarmer_melee" }
  };
}

function addEnemy(
  world: WorldState,
  id: string,
  type: "light" | "heavy",
  pos: Vec2
): EnemyState {
  const def = CONTENT.enemies[type];
  if (def === undefined) {
    throw new Error(`missing test enemy def: ${type}`);
  }

  const enemy: EnemyState = {
    id,
    type,
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: def.radius,
    speed: type === "heavy" ? 2.6 : def.speedTilesPerSec,
    contactDamage: def.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(def.contactCooldownS * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null
  };

  world.enemies.push(enemy);
  return enemy;
}

function runUntilNoProjectiles(world: WorldState): void {
  do {
    tick(world, new Map([["p1", IDLE_INPUT]]));
  } while (world.projectiles.length > 0);
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
