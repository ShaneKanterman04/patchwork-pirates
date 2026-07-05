import { describe, expect, it } from "vitest";

import {
  BETWEEN_CHUM,
  KRAKEN_HP,
  TENTACLE_COUNT,
  TENTACLE_PHASE_S,
  TICK_RATE,
  addPlayer,
  createWorld,
  startRun,
  tick,
  tileAt
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

const CHUM = enemyDef("chum", 18, {
  kind: "swarmer_melee"
});

const KRAKEN_TENTACLE = enemyDef("kraken_tentacle", 70, {
  kind: "tentacle",
  attackCooldownS: 2.2,
  telegraphS: 0.85,
  tileDamage: 26
});

const KRAKEN_HEAD = enemyDef("kraken_head", KRAKEN_HP, {
  kind: "kraken_head",
  attackCooldownS: 1.5,
  playerDamage: 16,
  tileDamage: 30
});

const NORMAL_WAVE: WaveDef = {
  durationS: 10,
  budget: 0,
  table: [{ enemyId: "chum", weight: 1, cost: 1 }]
};

const BOSS_WAVE: WaveDef = {
  durationS: 75,
  budget: 95,
  boss: "kraken",
  table: [{ enemyId: "chum", weight: 1, cost: 1 }]
};

const BOSS_CONTENT: ContentRegistry = {
  weapons: {},
  characters: {},
  items: {},
  enemies: {
    chum: CHUM,
    kraken_tentacle: KRAKEN_TENTACLE,
    kraken_head: KRAKEN_HEAD
  },
  modules: {},
  waves: [
    NORMAL_WAVE,
    NORMAL_WAVE,
    NORMAL_WAVE,
    NORMAL_WAVE,
    NORMAL_WAVE,
    NORMAL_WAVE,
    NORMAL_WAVE,
    BOSS_WAVE
  ]
};

describe("kraken boss director", () => {
  it("starts on wave 8, telegraphs tentacle attacks, cycles head and between phases", () => {
    const world = createBossWorld();
    world.run.phase = "build";
    world.run.wave = 7;
    world.run.phaseTicksLeft = 1;

    step(world);

    expect(world.run.phase).toBe("combat");
    expect(world.run.wave).toBe(8);
    expect(world.boss).toMatchObject({
      hp: KRAKEN_HP,
      maxHp: KRAKEN_HP,
      phase: "tentacles",
      phaseTicksLeft: TENTACLE_PHASE_S * TICK_RATE,
      headEnemyId: null,
      cycles: 0
    });

    step(world);

    const tentacles = world.enemies.filter(
      (enemy) => enemy.type === "kraken_tentacle"
    );
    expect(tentacles).toHaveLength(TENTACLE_COUNT);
    expect(new Set(tentacles.map(edgeKey))).toHaveLength(TENTACLE_COUNT);
    expect(tentacles.every((enemy) => enemy.telegraphTicks > 0)).toBe(true);
    expect(tentacles.every((enemy) => enemy.attackingTileId !== null)).toBe(true);

    const firstTentacle = tentacles[0];
    if (firstTentacle === undefined) {
      throw new Error("missing tentacle");
    }
    const targetId = firstTentacle.attackingTileId;
    const target = tileById(world, targetId);
    if (target === null) {
      throw new Error("missing tentacle target");
    }
    const targetHp = target.hp;

    const telegraphTicks = firstTentacle.telegraphTicks;
    for (let i = 1; i < telegraphTicks; i += 1) {
      step(world);
      expect(target.hp).toBe(targetHp);
    }

    step(world);
    expect(target.hp).toBe(targetHp - 26);

    for (const tentacle of world.enemies.filter(
      (enemy) => enemy.type === "kraken_tentacle"
    )) {
      tentacle.hp = 0;
    }

    step(world);

    expect(world.boss?.phase).toBe("head");
    const head = world.enemies.find((enemy) => enemy.type === "kraken_head");
    expect(head).toBeDefined();
    expect(world.boss?.headEnemyId).toBe(head?.id);
    expect(head?.hp).toBe(KRAKEN_HP);

    if (head === undefined) {
      throw new Error("missing kraken head");
    }
    head.hp -= 125;
    step(world);

    expect(world.boss?.hp).toBe(KRAKEN_HP - 125);
    expect(head.hp).toBe(KRAKEN_HP - 125);

    if (world.boss === null) {
      throw new Error("missing boss");
    }
    world.boss.phaseTicksLeft = 1;
    step(world);

    expect(world.boss?.phase).toBe("between");
    expect(world.boss?.hp).toBe(KRAKEN_HP - 125);
    expect(world.boss?.headEnemyId).toBeNull();
    expect(world.enemies.some((enemy) => enemy.type === "kraken_head")).toBe(false);
    expect(world.enemies.filter((enemy) => enemy.type === "chum")).toHaveLength(
      BETWEEN_CHUM
    );

    if (world.boss === null) {
      throw new Error("missing boss");
    }
    world.boss.phaseTicksLeft = 1;
    step(world);

    expect(world.boss?.phase).toBe("tentacles");
    expect(world.boss?.phaseTicksLeft).toBe(TENTACLE_PHASE_S * TICK_RATE);
  });

  it("sets victory when the head damage reduces boss hp to zero", () => {
    const world = createBossWorld();
    startRun(world);
    for (let wave = 1; wave < 8; wave += 1) {
      world.run.phase = "build";
      world.run.phaseTicksLeft = 1;
      step(world);
    }
    step(world);
    for (const tentacle of world.enemies) {
      tentacle.hp = 0;
    }
    step(world);

    const head = world.enemies.find((enemy) => enemy.type === "kraken_head");
    if (head === undefined) {
      throw new Error("missing kraken head");
    }
    head.hp = 0;

    step(world);

    expect(world.run.phase).toBe("victory");
    expect(world.boss).toBeNull();
    expect(world.enemies).toEqual([]);
  });

  it("leaves waves 1-7 and non-boss worlds without boss state", () => {
    const first = createWorld(42, {
      ...BOSS_CONTENT,
      waves: BOSS_CONTENT.waves.slice(0, 7)
    });
    const second = createWorld(42, {
      ...BOSS_CONTENT,
      waves: BOSS_CONTENT.waves.slice(0, 7)
    });
    addPlayer(first, "p1");
    addPlayer(second, "p1");
    startRun(first);
    startRun(second);

    for (let i = 0; i < 20; i += 1) {
      tick(first, new Map([["p1", IDLE_INPUT]]));
      tick(second, new Map([["p1", IDLE_INPUT]]));
      expect(first.boss).toBeNull();
      expect(second.boss).toBeNull();
    }

    expect(first).toEqual(second);
  });
});

function createBossWorld(): WorldState {
  const world = createWorld(7, BOSS_CONTENT);
  addPlayer(world, "p1");
  return world;
}

function step(world: WorldState): void {
  tick(world, new Map([["p1", IDLE_INPUT]]));
}

function tileById(world: WorldState, id: string | null) {
  if (id === null) {
    return null;
  }

  const [colText, rowText] = id.split(",");
  return tileAt(world.raft, Number(colText), Number(rowText)) ?? null;
}

function edgeKey(enemy: { pos: { x: number; y: number } }): string {
  if (enemy.pos.y < 0) {
    return "top";
  }
  if (enemy.pos.x > 5) {
    return "right";
  }
  if (enemy.pos.y > 5) {
    return "bottom";
  }
  return "left";
}

function enemyDef(id: string, maxHp: number, behavior: EnemyDef["behavior"]): EnemyDef {
  return {
    id,
    name: id,
    maxHp,
    speedTilesPerSec: 0,
    contactDamage: 0,
    contactCooldownS: behavior.kind === "swarmer_melee" ? 0.6 : behavior.attackCooldownS,
    radius: 0.35,
    coinValue: 0,
    salvageValue: 0,
    heavy: false,
    basePriority: 0,
    elite: false,
    behavior
  };
}
