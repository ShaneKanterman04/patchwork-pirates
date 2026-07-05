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
  shopPrice: 12,
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
  shopPrice: 12,
  targeting: "densest_cluster",
  cooldownS: 1.6,
  rangeTiles: 5,
  damage: 10,
  pattern: { kind: "lob", projectileSpeed: 7, aoeRadius: 1.3 }
};

const ANCHOR: WeaponDef = {
  id: "anchor",
  name: "Anchor",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 0.5,
  rangeTiles: 1.85,
  damage: 10,
  pattern: { kind: "orbit", orbitRadius: 1.3, orbitPeriodS: 2.2, hitRadius: 0.55 }
};

const BELL: WeaponDef = {
  id: "bell",
  name: "Bell",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 2.2,
  rangeTiles: 6,
  damage: 12,
  pattern: { kind: "dive", projectileSpeed: 12, aoeRadius: 0.6 }
};

const CONTENT: ContentRegistry = {
  weapons: { harpoon: HARPOON, coconut: COCONUT, anchor: ANCHOR, bell: BELL },
  characters: {},
  items: {},
  enemies: {
    light: enemyDef("light", false),
    heavy: enemyDef("heavy", true)
  },
  modules: {},
  waves: []
};

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

describe("harpoon projectile", () => {
  it("firing spawns a homing projectile", () => {
    const world = createWorld(1, CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
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
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
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
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
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
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
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

describe("anchor orbit", () => {
  it("persists while held, follows the wielder, pulses nearby enemies, and ignores distant enemies", () => {
    const world = createWorld(1, CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["anchor"]);
    const near = addEnemy(world, "near", "light", {
      x: player.pos.x + 1.3,
      y: player.pos.y
    });
    const far = addEnemy(world, "far", "light", {
      x: player.pos.x + 3,
      y: player.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]).toMatchObject({
      id: "orbit:p1:0",
      type: "anchor",
      ownerId: "p1",
      persistent: true
    });
    expect(world.projectiles[0]?.pos.x).toBeCloseTo(player.pos.x + 1.3);
    expect(world.projectiles[0]?.pos.y).toBeCloseTo(player.pos.y);
    expect(near.hp).toBe(40);
    expect(far.hp).toBe(50);

    player.pos = { x: 2.5, y: 2.5 };
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toHaveLength(1);
    expect(distance(world.projectiles[0]?.pos ?? player.pos, player.pos)).toBeCloseTo(
      1.3
    );
  });

  it("removes the anchor when the wielder is downed", () => {
    const world = createWorld(1, CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["anchor"]);

    tick(world, new Map([["p1", IDLE_INPUT]]));
    player.downed = true;
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toEqual([]);
  });
});

describe("seagull bell dive", () => {
  it("dives from above the target and explodes at the target position", () => {
    const world = createWorld(1, CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["bell"]);
    const target = addEnemy(world, "target", "light", {
      x: player.pos.x + 2,
      y: player.pos.y
    });
    const nearby = addEnemy(world, "nearby", "light", {
      x: target.pos.x + 0.4,
      y: target.pos.y
    });
    const outside = addEnemy(world, "outside", "light", {
      x: target.pos.x + 1.5,
      y: target.pos.y
    });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]).toMatchObject({
      type: "bell",
      pos: { x: target.pos.x, y: target.pos.y - 3.5 + 12 / TICK_RATE },
      vel: { x: 0, y: 12 },
      landPos: { ...target.pos },
      aoeRadius: 0.6
    });
    expect(world.events).toContainEqual({
      type: "weapon_fired",
      wielderId: "p1",
      weaponId: "bell",
      origin: { x: target.pos.x, y: target.pos.y - 3.5 },
      dir: { x: 0, y: 1 },
      arcDegrees: 0,
      range: 6
    });

    while (world.projectiles.length > 0) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(target.hp).toBe(38);
    expect(nearby.hp).toBe(38);
    expect(outside.hp).toBe(50);
    expect(world.events).toContainEqual({
      type: "explosion",
      pos: { x: 3.5, y: 1.5 },
      radius: 0.6
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
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0,
    animState: "move" as const,
    attackAnimTicks: 0
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
