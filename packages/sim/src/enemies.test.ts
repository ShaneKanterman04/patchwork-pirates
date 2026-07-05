import { describe, expect, it } from "vitest";

import {
  TICK_RATE,
  addPlayer,
  createWorld,
  damageTile,
  isWalkable,
  selectTarget,
  tileAt,
  updateEnemies,
  updatePlayerWeapons,
  updateProjectiles
} from "./index";
import type {
  ContentRegistry,
  EnemyDef,
  EnemyState,
  Vec2,
  WeaponDef,
  WorldState
} from "./index";

const HARPOON: WeaponDef = {
  id: "harpoon",
  name: "Harpoon",
  shopPrice: 12,
  targeting: "attacking_raft",
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

const CHUM = enemyDef({
  id: "chum",
  maxHp: 18,
  speed: 2.6,
  contactDamage: 6,
  cooldownS: 0.6,
  radius: 0.3,
  behavior: { kind: "swarmer_melee" }
});

const SPITTER = enemyDef({
  id: "spitter",
  maxHp: 30,
  speed: 1.6,
  contactDamage: 0,
  cooldownS: 2.2,
  radius: 0.35,
  behavior: {
    kind: "ranged_lobber",
    attackRangeTiles: 4.5,
    attackCooldownS: 2.2,
    projectileSpeed: 6,
    aoeRadius: 0.9,
    playerDamage: 8,
    tileDamage: 2
  }
});

const PLANK_BITER = enemyDef({
  id: "plank_biter",
  maxHp: 40,
  speed: 2,
  contactDamage: 0,
  cooldownS: 1,
  radius: 0.35,
  behavior: {
    kind: "tile_eater",
    attackCooldownS: 1,
    tileDamage: 2
  }
});

const BRUTE = enemyDef({
  id: "brute",
  maxHp: 220,
  speed: 1.2,
  contactDamage: 18,
  cooldownS: 1.2,
  radius: 0.6,
  heavy: true,
  basePriority: 15,
  elite: true,
  behavior: {
    kind: "tank_smasher",
    attackCooldownS: 1.2,
    tileDamage: 2,
    knockbackRadius: 1.2,
    knockbackStrength: 3
  }
});

const TENTACLE = enemyDef({
  id: "tentacle",
  maxHp: 60,
  speed: 0,
  contactDamage: 0,
  cooldownS: 1.5,
  radius: 0.45,
  behavior: {
    kind: "tentacle",
    attackCooldownS: 1.5,
    telegraphS: 0.2,
    tileDamage: 3
  }
});

const CONTENT: ContentRegistry = {
  weapons: { harpoon: HARPOON },
  characters: {},
  items: {},
  enemies: {
    chum: CHUM,
    spitter: SPITTER,
    plank_biter: PLANK_BITER,
    brute: BRUTE,
    tentacle: TENTACLE
  },
  modules: {},
  waves: []
};

describe("spitter crab behavior", () => {
  it("holds at range and fires enemy lobs that damage players and tiles only", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 1.5, y: 1.5 };
    const spitter = addEnemy(world, "spitter1", "spitter", {
      x: 4.5,
      y: 1.5
    });
    const bystander = addEnemy(world, "chum1", "chum", { x: 1.5, y: 1.5 });
    const startPos = { ...spitter.pos };

    updateEnemies(world);

    expect(spitter.pos).toEqual(startPos);
    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]).toMatchObject({
      faction: "enemy",
      ownerId: "spitter1",
      landPos: { x: 1.5, y: 1.5 },
      damage: 8,
      tileDamage: 2
    });

    world.projectiles = [];
    spitter.contactCooldownTicks = 0;
    world.tick = spitter.contactCooldownMax;

    updateEnemies(world);

    expect(spitter.attackingTileId).toBe("1,1");
    expect(world.projectiles[0]?.landPos).toEqual({ x: 1.5, y: 1.5 });

    const tile = tileAt(world.raft, 1, 1);
    if (tile === undefined) {
      throw new Error("missing test tile");
    }
    const playerHp = player.hp;
    const enemyHp = bystander.hp;
    const tileHp = tile.hp;

    runProjectilesToEmpty(world);

    expect(player.hp).toBe(playerHp - 8);
    expect(tile.hp).toBe(tileHp - 2);
    expect(bystander.hp).toBe(enemyHp);
    expect(world.events).toContainEqual({
      type: "explosion",
      pos: { x: 1.5, y: 1.5 },
      radius: 0.9
    });
  });
});

describe("plank-biter behavior", () => {
  it("ignores players, chews nearest deck tile into a hole, and draws harpoon targeting", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 0.6, y: 0.6 };
    const biter = addEnemy(world, "biter1", "plank_biter", {
      x: -0.2,
      y: 0.5
    });
    const tile = tileAt(world.raft, 0, 0);
    if (tile === undefined) {
      throw new Error("missing test tile");
    }

    for (let i = 0; i < 190 && !tile.broken; i += 1) {
      updateEnemies(world);
    }

    expect(player.hp).toBe(player.maxHp);
    expect(tile.broken).toBe(true);
    expect(biter.attackingTileId).toBe("0,0");
    const plain = addEnemy(world, "plain", "chum", { x: player.pos.x + 0.4, y: 0.6 });
    expect(selectTarget(world, player, HARPOON)).toBe(biter);
    expect(selectTarget(world, player, HARPOON)).not.toBe(plain);
  });
});

describe("brute turtle behavior", () => {
  it("is a slow heavy elite that smashes players and tiles on contact", () => {
    expect(BRUTE.maxHp).toBe(220);
    expect(BRUTE.speedTilesPerSec).toBe(1.2);
    expect(BRUTE.heavy).toBe(true);
    expect(BRUTE.elite).toBe(true);

    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const brute = addEnemy(world, "brute1", "brute", { x: 2.0, y: 2.5 });
    const tile = tileAt(world.raft, 2, 2);
    if (tile === undefined) {
      throw new Error("missing test tile");
    }

    updateEnemies(world);

    expect(player.hp).toBe(82);
    expect(tile.hp).toBe(8);
    expect(brute.attackingTileId).toBe("2,2");
  });

  it("pushes players without shoving them into holes or off raft", () => {
    const world = createWorld(1, CONTENT);
    const edgePlayer = addPlayer(world, "edge");
    edgePlayer.pos = { x: 0.45, y: 2.5 };
    const holePlayer = addPlayer(world, "hole");
    holePlayer.pos = { x: 2.95, y: 2.5 };
    damageTile(world, 3, 2, 10);
    addEnemy(world, "edgeBrute", "brute", { x: 1.0, y: 2.5 });
    addEnemy(world, "holeBrute", "brute", { x: 2.5, y: 2.5 });

    updateEnemies(world);

    expect(edgePlayer.pos.x).toBeGreaterThanOrEqual(0.4);
    expect(holePlayer.pos.x).toBeLessThan(3);
    expect(isWalkable(world.raft, holePlayer.pos.x, holePlayer.pos.y)).toBe(true);
  });

  it("is slowed by harpoon and uses the reduced step while slowed", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1", ["harpoon"]);
    player.pos = { x: 1.5, y: 1.5 };
    const brute = addEnemy(world, "brute1", "brute", { x: 3.5, y: 1.5 });

    updatePlayerWeapons(world);
    runProjectilesToEmpty(world);

    expect(brute.slowTicks).toBeGreaterThan(0);
    expect(brute.slowFactor).toBe(0.5);

    const before = { ...brute.pos };
    updateEnemies(world);

    expect(distance(before, brute.pos)).toBeCloseTo((brute.speed * 0.5) / TICK_RATE);
  });
});

describe("enemy behavior dispatch", () => {
  it("runs each behavior independently without cross-contamination", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const chum = addEnemy(world, "chum1", "chum", { x: 2.9, y: 2.5 });
    const spitter = addEnemy(world, "spitter1", "spitter", { x: 4.5, y: 2.5 });
    const biter = addEnemy(world, "biter1", "plank_biter", { x: -0.2, y: 0.5 });
    const brute = addEnemy(world, "brute1", "brute", { x: 2.0, y: 2.5 });

    updateEnemies(world);

    expect(player.hp).toBe(76);
    expect(chum.attackingTileId).toBeNull();
    expect(spitter.contactDamage).toBe(0);
    expect(world.projectiles.some((projectile) => projectile.ownerId === spitter.id))
      .toBe(true);
    expect(biter.attackingTileId).toBe("0,0");
    expect(brute.attackingTileId).toBe("2,2");
  });
});

describe("enemy animation state", () => {
  it("reports attack during a contact hit window and returns to move while swimming", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const chum = addEnemy(world, "chum1", "chum", { x: 2.9, y: 2.5 });

    updateEnemies(world);

    expect(chum.animState).toBe("attack");

    for (let i = 0; i < Math.round(0.3 * TICK_RATE); i += 1) {
      updateEnemies(world);
    }

    expect(chum.animState).toBe("move");
  });

  it("reports windup while telegraphing and attack when the slam lands", () => {
    const world = createWorld(1, CONTENT);
    const tentacle = addEnemy(world, "tentacle1", "tentacle", {
      x: -0.2,
      y: 0.5
    });

    updateEnemies(world);

    expect(tentacle.animState).toBe("windup");

    while (tentacle.telegraphTicks > 1) {
      updateEnemies(world);
      expect(tentacle.animState).toBe("windup");
    }

    updateEnemies(world);

    expect(tentacle.animState).toBe("attack");
  });
});

function enemyDef(args: {
  id: string;
  maxHp: number;
  speed: number;
  contactDamage: number;
  cooldownS: number;
  radius: number;
  heavy?: boolean;
  basePriority?: number;
  elite?: boolean;
  behavior: EnemyDef["behavior"];
}): EnemyDef {
  return {
    id: args.id,
    name: args.id,
    maxHp: args.maxHp,
    speedTilesPerSec: args.speed,
    contactDamage: args.contactDamage,
    contactCooldownS: args.cooldownS,
    radius: args.radius,
    coinValue: 0,
    heavy: args.heavy ?? false,
    basePriority: args.basePriority ?? 0,
    elite: args.elite ?? false,
    behavior: args.behavior
  };
}

function addEnemy(
  world: WorldState,
  id: string,
  type: "chum" | "spitter" | "plank_biter" | "brute" | "tentacle",
  pos: Vec2
): EnemyState {
  const def = world.content.enemies[type];
  if (def === undefined) {
    throw new Error(`missing test enemy def: ${type}`);
  }

  const enemy: EnemyState = {
    id,
    type,
    animState: "move",
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: def.radius,
    speed: def.speedTilesPerSec,
    contactDamage: def.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(behaviorCooldownS(def) * TICK_RATE),
    attackAnimTicks: 0,
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}

function behaviorCooldownS(def: EnemyDef): number {
  if (def.behavior.kind === "swarmer_melee") {
    return def.contactCooldownS;
  }

  return def.behavior.attackCooldownS;
}

function runProjectilesToEmpty(world: WorldState): void {
  while (world.projectiles.length > 0) {
    updateProjectiles(world);
  }
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
