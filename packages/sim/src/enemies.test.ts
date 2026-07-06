import { describe, expect, it } from "vitest";

import {
  TICK_RATE,
  addPlayer,
  createWorld,
  damageTile,
  isWalkable,
  selectTarget,
  tileAt,
  resolveEnemyDeaths,
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

const LEAPER = enemyDef({
  id: "leaper",
  maxHp: 24,
  speed: 1.8,
  contactDamage: 7,
  cooldownS: 0.5,
  radius: 0.3,
  behavior: {
    kind: "leap",
    windupS: 0.6,
    leapTiles: 2,
    leapSpeedMult: 6,
    cooldownS: 0.8
  }
});

const COIN_THIEF = enemyDef({
  id: "coin_thief",
  maxHp: 16,
  speed: 2.2,
  contactDamage: 4,
  cooldownS: 0.7,
  radius: 0.28,
  behavior: {
    kind: "steal",
    fleeSpeedMult: 3,
    maxCarried: 1
  }
});

const BLOATER = enemyDef({
  id: "bloater",
  maxHp: 120,
  speed: 0.9,
  contactDamage: 8,
  cooldownS: 1.2,
  radius: 0.55,
  behavior: {
    kind: "explode_on_death",
    aoeRadius: 1.2,
    playerDamage: 18,
    tileDamage: 3
  }
});

const SCREAMER = enemyDef({
  id: "screamer",
  maxHp: 30,
  speed: 1.8,
  contactDamage: 0,
  cooldownS: 1,
  radius: 0.3,
  behavior: {
    kind: "scream_buff",
    screamCooldownS: 0.5,
    buffRadiusTiles: 2.5,
    buffSpeedMult: 1.3,
    buffDurationS: 0.25
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
    tentacle: TENTACLE,
    leaper: LEAPER,
    coin_thief: COIN_THIEF,
    bloater: BLOATER,
    screamer: SCREAMER
  },
  modules: {},
  waves: []
};

describe("leaper behavior", () => {
  it("winds up, dashes through contact, damages a player, and cools down", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const leaper = addEnemy(world, "leaper1", "leaper", { x: 1.3, y: 2.5 });
    const startX = leaper.pos.x;

    updateEnemies(world);

    expect(leaper.animState).toBe("windup");
    expect(leaper.leapDir).toEqual({ x: 1, y: 0 });
    expect(leaper.pos.x).toBe(startX);

    while ((leaper.leapWindupTicks ?? 0) > 0) {
      updateEnemies(world);
    }

    updateEnemies(world);

    expect(leaper.pos.x).toBeGreaterThan(startX);

    while ((leaper.leapRemainingTiles ?? 0) > 0 && player.hp === player.maxHp) {
      updateEnemies(world);
    }

    expect(player.hp).toBe(player.maxHp - leaper.contactDamage);

    while ((leaper.leapRemainingTiles ?? 0) > 0) {
      updateEnemies(world);
    }

    expect(leaper.leapCooldownTicks).toBeGreaterThan(0);
    const cooldown = leaper.leapCooldownTicks ?? 0;

    updateEnemies(world);

    expect(leaper.animState).not.toBe("windup");
    expect(leaper.leapCooldownTicks).toBe(cooldown - 1);
  });
});

describe("bloater behavior", () => {
  it("explodes on death, damaging nearby players and adjacent tiles", () => {
    const world = createWorld(1, CONTENT);
    const near = addPlayer(world, "near");
    near.pos = { x: 2.6, y: 2.5 };
    const far = addPlayer(world, "far");
    far.pos = { x: 4.5, y: 4.5 };
    const bloater = addEnemy(world, "bloater1", "bloater", { x: 2.5, y: 2.5 });
    const centerTile = tileAt(world.raft, 2, 2);
    const adjacentTile = tileAt(world.raft, 3, 2);
    if (centerTile === undefined || adjacentTile === undefined) {
      throw new Error("missing test tile");
    }
    const centerHp = centerTile.hp;
    const adjacentHp = adjacentTile.hp;
    bloater.hp = 0;

    resolveEnemyDeaths(world);

    expect(world.events).toContainEqual({
      type: "explosion",
      pos: { x: 2.5, y: 2.5 },
      radius: 1.2
    });
    expect(near.hp).toBe(near.maxHp - 18);
    expect(far.hp).toBe(far.maxHp);
    expect(centerTile.hp).toBe(centerHp - 3);
    expect(adjacentTile.hp).toBe(adjacentHp - 3);
  });
});

describe("screamer behavior", () => {
  it("buffs nearby enemies, not itself, emits a scream, and the buff expires", () => {
    const world = createWorld(1, CONTENT);
    addPlayer(world, "p1").pos = { x: 4.5, y: 2.5 };
    const screamer = addEnemy(world, "screamer1", "screamer", { x: 2.5, y: 2.5 });
    const nearby = addEnemy(world, "chum1", "chum", { x: 2.8, y: 2.5 });
    const far = addEnemy(world, "chum2", "chum", { x: 5.5, y: 2.5 });

    updateEnemies(world);

    expect(world.events).toContainEqual({
      type: "enemy_screamed",
      pos: { x: 2.5, y: 2.5 }
    });
    expect(screamer.buffTicks ?? 0).toBe(0);
    expect(screamer.buffFactor ?? 1).toBe(1);
    expect(nearby.buffTicks).toBeGreaterThan(0);
    expect(nearby.buffFactor).toBe(1.3);
    expect(far.buffTicks ?? 0).toBe(0);

    const before = { ...nearby.pos };
    updateEnemies(world);

    expect(distance(before, nearby.pos)).toBeCloseTo((nearby.speed * 1.3) / TICK_RATE);

    for (let i = 0; i < Math.round(0.25 * TICK_RATE) + 2; i += 1) {
      updateEnemies(world);
    }

    expect(nearby.buffTicks).toBe(0);
    expect(nearby.buffFactor).toBe(1);
  });

  it("backs away to keep distance from players", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    player.pos = { x: 2.5, y: 2.5 };
    const screamer = addEnemy(world, "screamer1", "screamer", { x: 3.5, y: 2.5 });
    const startDistance = distance(screamer.pos, player.pos);

    updateEnemies(world);

    expect(distance(screamer.pos, player.pos)).toBeGreaterThan(startDistance);
  });
});

describe("coin thief behavior", () => {
  it("eats a coin pickup, flees when full, and despawns without a kill event", () => {
    const world = createWorld(1, CONTENT);
    const thief = addEnemy(world, "thief1", "coin_thief", { x: 2.1, y: 2.5 });
    world.pickups.push({ id: "coin1", kind: "coin", pos: { x: 2.4, y: 2.5 }, value: 1 });

    updateEnemies(world);

    expect(world.pickups).toEqual([]);
    expect(thief.carriedCoins).toBe(1);
    expect(thief.animState).toBe("attack");

    updateEnemies(world);

    expect(thief.pos.x).toBeLessThan(2.1);

    for (let i = 0; i < 220 && world.enemies.includes(thief); i += 1) {
      updateEnemies(world);
    }

    expect(world.enemies).not.toContain(thief);
    expect(world.events).not.toContainEqual({
      type: "enemy_killed",
      enemyId: "thief1",
      pos: expect.any(Object)
    });
  });

  it("drops carried coins plus one on death", () => {
    const world = createWorld(1, CONTENT);
    const thief = addEnemy(world, "thief1", "coin_thief", { x: 2.5, y: 2.5 });
    thief.carriedCoins = 2;
    thief.hp = 0;

    resolveEnemyDeaths(world);

    expect(world.enemies).toEqual([]);
    expect(world.events).toContainEqual({
      type: "enemy_killed",
      enemyId: "thief1",
      pos: { x: 2.5, y: 2.5 }
    });
    expect(world.pickups.filter((pickup) => pickup.kind === "coin")).toHaveLength(3);
  });

  it("uses deterministic primitive outcomes for matching worlds", () => {
    const first = thiefDeterminismWorld();
    const second = thiefDeterminismWorld();

    for (let i = 0; i < 20; i += 1) {
      updateEnemies(first);
      updateEnemies(second);
    }

    first.enemies[0]!.hp = 0;
    second.enemies[0]!.hp = 0;
    resolveEnemyDeaths(first);
    resolveEnemyDeaths(second);

    expect({
      enemies: first.enemies,
      pickups: first.pickups,
      events: first.events,
      rngState: first.rngState
    }).toEqual({
      enemies: second.enemies,
      pickups: second.pickups,
      events: second.events,
      rngState: second.rngState
    });
  });
});

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
    player.pos = { x: 1.6, y: 0.6 };
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
  type:
    | "chum"
    | "spitter"
    | "plank_biter"
    | "brute"
    | "tentacle"
    | "leaper"
    | "coin_thief"
    | "bloater"
    | "screamer",
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
    buffTicks: 0,
    buffFactor: 1,
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0,
    leapWindupTicks: 0,
    leapCooldownTicks: 0,
    leapRemainingTiles: 0,
    leapDir: { x: 0, y: 0 },
    carriedCoins: 0,
    escaped: false
  };

  world.enemies.push(enemy);
  return enemy;
}

function behaviorCooldownS(def: EnemyDef): number {
  switch (def.behavior.kind) {
    case "swarmer_melee":
    case "leap":
    case "steal":
    case "explode_on_death":
      return def.contactCooldownS;
    case "scream_buff":
      return def.behavior.screamCooldownS;
    case "ranged_lobber":
    case "tile_eater":
    case "tank_smasher":
    case "tentacle":
    case "kraken_head":
      return def.behavior.attackCooldownS;
  }
}

function thiefDeterminismWorld(): WorldState {
  const world = createWorld(42, CONTENT);
  addPlayer(world, "p1").pos = { x: 2.5, y: 2.5 };
  addEnemy(world, "thief1", "coin_thief", { x: 2.1, y: 2.5 });
  world.pickups.push({ id: "coin1", kind: "coin", pos: { x: 2.4, y: 2.5 }, value: 1 });
  return world;
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
