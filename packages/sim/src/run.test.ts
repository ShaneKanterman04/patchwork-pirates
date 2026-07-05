import { describe, expect, it } from "vitest";

import {
  BUILD_DURATION_S,
  MAX_ENEMIES,
  SPAWN_INTERVAL_TICKS,
  TICK_RATE,
  addPlayer,
  createEnemy,
  createWorld,
  setCharacter,
  setPlayerReady,
  startRun,
  tick
} from "./index";
import type {
  ContentRegistry,
  EnemyDef,
  PlayerInput,
  WaveDef,
  WeaponDef,
  WorldState
} from "./index";

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const CHUM = enemyDef("chum", 10);
const BITER = enemyDef("plank_biter", 20);

const ONE_COST_WAVE: WaveDef = {
  durationS: 10,
  budget: 3,
  table: [{ enemyId: "chum", weight: 1, cost: 1 }]
};

const TWO_COST_WAVE: WaveDef = {
  durationS: 10,
  budget: 4,
  table: [{ enemyId: "plank_biter", weight: 1, cost: 2 }]
};

const TEST_CONTENT: ContentRegistry = {
  weapons: {},
  characters: {},
  items: {},
  enemies: {
    chum: CHUM,
    plank_biter: BITER
  },
  modules: {},
  waves: [ONE_COST_WAVE, TWO_COST_WAVE]
};

describe("run phase machine", () => {
  it("starts in combat wave 1, enters safe build, and readies into next combat", () => {
    const world = createWorld(1, TEST_CONTENT);
    addPlayer(world, "p1");
    startRun(world);
    world.enemies.push(createEnemy(world, CHUM, { x: -1, y: 1 }));
    world.projectiles.push(enemyProjectile());
    world.run.phaseTicksLeft = 1;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run).toMatchObject({
      phase: "build",
      wave: 1,
      phaseTicksLeft: BUILD_DURATION_S * TICK_RATE,
      readyPlayerIds: []
    });
    expect(world.enemies).toEqual([]);
    expect(world.projectiles).toEqual([]);

    setPlayerReady(world, "p1", true);
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run).toMatchObject({
      phase: "combat",
      wave: 2,
      phaseTicksLeft: TWO_COST_WAVE.durationS * TICK_RATE,
      budgetRemaining: TWO_COST_WAVE.budget,
      spawnTimer: 0,
      readyPlayerIds: []
    });
  });

  it("auto-ends a non-boss wave early once the budget is spent and all enemies are dead", () => {
    const world = createWorld(7, TEST_CONTENT);
    addPlayer(world, "p1");
    startRun(world); // wave 1: budget 3, duration 10s (300 ticks)

    // Spend the whole spawn budget (spawns the wave's chum over a few intervals).
    let guard = 0;
    while (world.run.budgetRemaining > 0 && guard < 3000) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
      guard += 1;
    }
    expect(world.run.phase).toBe("combat");
    expect(world.enemies.length).toBeGreaterThan(0);
    expect(world.tick).toBeLessThan(ONE_COST_WAVE.durationS * TICK_RATE);

    // Kill every enemy: one tick resolves the deaths, the next detects the
    // cleared sea and ends the wave — all well before the timer would.
    for (const enemy of world.enemies) {
      enemy.hp = 0;
    }
    tick(world, new Map([["p1", IDLE_INPUT]]));
    expect(world.enemies).toEqual([]);
    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run.phase).toBe("build");
    expect(world.tick).toBeLessThan(ONE_COST_WAVE.durationS * TICK_RATE);
  });

  it("sets victory when non-boss wave 8 combat expires as a fallback", () => {
    const content = {
      ...TEST_CONTENT,
      waves: Array.from({ length: 8 }, () => ONE_COST_WAVE)
    };
    const world = createWorld(1, content);
    addPlayer(world, "p1");
    world.run.phase = "combat";
    world.run.wave = 8;
    world.run.phaseTicksLeft = 1;
    world.run.budgetRemaining = 0;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run.phase).toBe("victory");
    expect(world.run.wave).toBe(8);
  });
});

describe("budget spawner", () => {
  it("spends the wave budget on enemies drawn from the wave table", () => {
    const world = createWorld(2, TEST_CONTENT);
    addPlayer(world, "p1");
    startRun(world);

    for (let i = 0; i < SPAWN_INTERVAL_TICKS * 3; i += 1) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(world.run.budgetRemaining).toBe(0);
    expect(world.enemies.map((enemy) => enemy.type)).toEqual([
      "chum",
      "chum",
      "chum"
    ]);
  });

  it("respects the maximum enemy cap", () => {
    const world = createWorld(3, TEST_CONTENT);
    addPlayer(world, "p1");
    world.run.budgetRemaining = 10;

    for (let i = 0; i < MAX_ENEMIES; i += 1) {
      world.enemies.push(createEnemy(world, CHUM, { x: -1, y: i }));
    }

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.enemies).toHaveLength(MAX_ENEMIES);
    expect(world.run.budgetRemaining).toBe(10);
  });

  it("is inert when content has no waves", () => {
    const world = createWorld(4, {
      weapons: {},
      characters: {},
      items: {},
      enemies: { chum: CHUM },
      modules: {},
      waves: []
    });
    addPlayer(world, "p1");
    world.run.phase = "combat";
    world.run.phaseTicksLeft = 1;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.enemies).toEqual([]);
    expect(world.run).toMatchObject({
      phase: "combat",
      wave: 1,
      phaseTicksLeft: 1,
      budgetRemaining: 0
    });
  });
});

describe("run lifecycle", () => {
  it("defeats the run when the core is destroyed", () => {
    const world = createWorld(5, TEST_CONTENT);
    addPlayer(world, "p1");
    startRun(world);
    world.coreDestroyed = true;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run.phase).toBe("defeat");
  });

  it("defeats the run when the sole player is down", () => {
    const world = createWorld(6, TEST_CONTENT);
    const player = addPlayer(world, "p1");
    startRun(world);
    player.hp = 0;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run.phase).toBe("defeat");
  });

  it("freezes terminal phases except for world tick advancement", () => {
    const world = createWorld(7, TEST_CONTENT);
    const player = addPlayer(world, "p1");
    world.run.phase = "victory";
    const startPos = { ...player.pos };
    const startRun = { ...world.run, readyPlayerIds: [...world.run.readyPlayerIds] };

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 0 }, dash: false, interact: false }]
      ])
    );

    expect(player.pos).toEqual(startPos);
    expect(world.run).toEqual(startRun);
    expect(world.enemies).toEqual([]);
    expect(world.tick).toBe(1);
  });

  it("starts fresh worlds in lobby and startRun enters combat wave 1", () => {
    const world = createWorld(8, TEST_CONTENT);
    addPlayer(world, "p1");

    expect(world.run).toMatchObject({
      phase: "lobby",
      wave: 1,
      phaseTicksLeft: 0,
      budgetRemaining: 0,
      spawnTimer: 0
    });

    startRun(world);

    expect(world.run).toMatchObject({
      phase: "combat",
      wave: 1,
      phaseTicksLeft: ONE_COST_WAVE.durationS * TICK_RATE,
      budgetRemaining: ONE_COST_WAVE.budget,
      spawnTimer: 0,
      readyPlayerIds: []
    });
  });

  it("swaps lobby characters without stacking stats or weapons", () => {
    const world = createWorld(9, {
      ...TEST_CONTENT,
      weapons: {
        cutlass: weaponDef("cutlass"),
        harpoon_gun: weaponDef("harpoon_gun")
      },
      characters: {
        captain: {
          id: "captain",
          name: "Captain",
          startingWeaponId: "cutlass",
          statProfile: { maxHp: 10, damageMult: 0.2 },
          passive: "attack_speed_aura",
          special: "mark_dangerous"
        },
        fisher: {
          id: "fisher",
          name: "Fisher",
          startingWeaponId: "harpoon_gun",
          statProfile: { pickupRadius: 0.6 },
          passive: "none",
          special: "harpoon_raft_priority"
        }
      }
    });
    const player = addPlayer(world, "p1", ["cutlass"]);

    expect(setCharacter(world, "p1", "captain")).toBe(true);
    expect(player.weapons.map((weapon) => weapon.defId)).toEqual(["cutlass"]);
    expect(player.maxHp).toBe(110);
    expect(player.damageMult).toBe(1.2);

    expect(setCharacter(world, "p1", "fisher")).toBe(true);
    expect(player.weapons.map((weapon) => weapon.defId)).toEqual(["harpoon_gun"]);
    expect(player.maxHp).toBe(100);
    expect(player.damageMult).toBe(1);
    expect(player.pickupRadius).toBeCloseTo(1.8);

    expect(setCharacter(world, "p1", "fisher")).toBe(true);
    expect(player.pickupRadius).toBeCloseTo(1.8);
  });

  it("lobby phase ticks are inert for run worlds", () => {
    const world = createWorld(10, TEST_CONTENT);
    const player = addPlayer(world, "p1");
    const startPos = { ...player.pos };
    world.run.phaseTicksLeft = 99;

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 0 }, dash: true, interact: true }]
      ])
    );

    expect(player.pos).toEqual(startPos);
    expect(world.run.phase).toBe("lobby");
    expect(world.run.phaseTicksLeft).toBe(99);
    expect(world.enemies).toEqual([]);
    expect(world.tick).toBe(1);
  });
});

function enemyDef(id: string, maxHp: number): EnemyDef {
  return {
    id,
    name: id,
    maxHp,
    speedTilesPerSec: 0,
    contactDamage: 0,
    contactCooldownS: 1,
    radius: 0.3,
    coinValue: 0,
    behavior: { kind: "swarmer_melee" }
  };
}

function enemyProjectile(): WorldState["projectiles"][number] {
  return {
    id: "enemy_projectile",
    type: "enemy_glob",
    faction: "enemy",
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    damage: 0,
    tileDamage: 0,
    ttl: 10,
    ownerId: "enemy",
    homing: false,
    targetId: null,
    landPos: { x: 0, y: 0 },
    aoeRadius: 0,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0
  };
}

function weaponDef(id: string): WeaponDef {
  return {
    id,
    name: id,
    shopPrice: 1,
    targeting: "nearest",
    cooldownS: 1,
    rangeTiles: 1,
    damage: 1,
    pattern: { kind: "melee_arc", arcDegrees: 90 }
  };
}
