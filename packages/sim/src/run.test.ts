import { describe, expect, it } from "vitest";

import {
  BUILD_DURATION_S,
  MAX_ENEMIES,
  SPAWN_INTERVAL_TICKS,
  TICK_RATE,
  addPlayer,
  createEnemy,
  createWorld,
  setPlayerReady,
  tick
} from "./index";
import type {
  ContentRegistry,
  EnemyDef,
  PlayerInput,
  WaveDef,
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

  it("sets victory when wave 8 combat expires", () => {
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
      items: {},
      enemies: { chum: CHUM },
      modules: {},
      waves: []
    });
    addPlayer(world, "p1");
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
    world.coreDestroyed = true;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(world.run.phase).toBe("defeat");
  });

  it("defeats the run when the sole player is down", () => {
    const world = createWorld(6, TEST_CONTENT);
    const player = addPlayer(world, "p1");
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
