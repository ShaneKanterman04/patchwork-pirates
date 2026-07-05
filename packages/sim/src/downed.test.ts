import { describe, expect, it } from "vitest";

import {
  DOWNED_BLEED_OUT_S,
  REVIVE_HP_FRACTION,
  REVIVE_RANGE,
  REVIVE_S,
  TICK_RATE,
  addPlayer,
  createWorld,
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
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 18,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
};

const TEST_CONTENT: ContentRegistry = {
  weapons: { cutlass: CUTLASS },
  characters: {},
  items: {},
  enemies: {
    chum: {
      id: "chum",
      name: "Chum",
      maxHp: 18,
      speedTilesPerSec: 2.6,
      contactDamage: 6,
      contactCooldownS: 0.6,
      radius: 0.3,
      coinValue: 0,
      behavior: { kind: "swarmer_melee" }
    }
  },
  modules: {},
  waves: []
};

const WAVE_CONTENT: ContentRegistry = {
  ...TEST_CONTENT,
  waves: [
    {
      durationS: 10,
      budget: 0,
      table: [{ enemyId: "chum", weight: 1, cost: 1 }]
    }
  ]
};

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const INTERACT_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: true
};

describe("downed state", () => {
  it("downs a player at 0 hp and makes them immobile with weapons stopped", () => {
    const world = createWorld(1, TEST_CONTENT);
    const player = addPlayer(world, "p1", ["cutlass"]);
    addEnemy(world, "e1", { x: player.pos.x + 1, y: player.pos.y });
    player.hp = 0;

    tick(world, new Map([["p1", moveRightInput()]]));

    expect(player.downed).toBe(true);
    expect(player.out).toBe(false);
    expect(player.hp).toBe(0);
    expect(player.bleedOutTicks).toBe(DOWNED_BLEED_OUT_S * TICK_RATE - 1);
    expect(player.pos).toEqual({ x: 1.5, y: 1.5 });
    expect(world.events).not.toContainEqual(
      expect.objectContaining({ type: "weapon_fired", wielderId: "p1" })
    );
    expect(world.enemies[0]?.hp).toBe(18);
  });

  it("requires a second active player to revive and restores 30 percent hp", () => {
    const world = createWorld(2, TEST_CONTENT);
    const downed = addPlayer(world, "downed");
    const reviver = addPlayer(world, "reviver");
    reviver.pos = { x: downed.pos.x + REVIVE_RANGE - 0.1, y: downed.pos.y };
    downed.hp = 0;
    tick(world, new Map([["downed", INTERACT_INPUT]]));

    expect(downed.downed).toBe(true);
    expect(downed.reviveProgressTicks).toBe(0);

    for (let i = 0; i < REVIVE_S * TICK_RATE; i += 1) {
      tick(world, new Map([["reviver", INTERACT_INPUT]]));
    }

    expect(downed.downed).toBe(false);
    expect(downed.out).toBe(false);
    expect(downed.hp).toBe(Math.round(downed.maxHp * REVIVE_HP_FRACTION));
    expect(downed.bleedOutTicks).toBe(0);
    expect(downed.reviveProgressTicks).toBe(0);
  });

  it("resets revive progress when the reviver takes a hit or leaves range", () => {
    const world = createWorld(3, TEST_CONTENT);
    const downed = addPlayer(world, "downed");
    const reviver = addPlayer(world, "reviver");
    reviver.pos = { x: downed.pos.x + 0.5, y: downed.pos.y };
    downed.hp = 0;
    tick(world, new Map());

    tick(world, new Map([["reviver", INTERACT_INPUT]]));
    expect(downed.reviveProgressTicks).toBe(1);

    reviver.hp -= 1;
    tick(world, new Map([["reviver", INTERACT_INPUT]]));
    expect(downed.reviveProgressTicks).toBe(0);

    tick(world, new Map([["reviver", INTERACT_INPUT]]));
    expect(downed.reviveProgressTicks).toBe(1);

    reviver.pos = { x: downed.pos.x + REVIVE_RANGE + 0.1, y: downed.pos.y };
    tick(world, new Map([["reviver", INTERACT_INPUT]]));
    expect(downed.reviveProgressTicks).toBe(0);
  });

  it("bleeds out with no reviver and out players are excluded from enemy targeting", () => {
    const world = createWorld(4, TEST_CONTENT);
    const outPlayer = addPlayer(world, "out");
    const active = addPlayer(world, "active");
    outPlayer.pos = { x: 1.5, y: 1.5 };
    active.pos = { x: 4.5, y: 1.5 };
    outPlayer.hp = 0;
    tick(world, new Map());

    for (let i = 0; i < DOWNED_BLEED_OUT_S * TICK_RATE - 1; i += 1) {
      tick(world, new Map());
    }

    expect(outPlayer.downed).toBe(false);
    expect(outPlayer.out).toBe(true);

    const enemy = addEnemy(world, "e1", { x: 0.5, y: 1.5 });
    tick(world, new Map([["active", IDLE_INPUT]]));

    expect(enemy.pos.x).toBeGreaterThan(0.5);
    expect(enemy.pos.x).toBeGreaterThan(outPlayer.pos.x - 1);
  });

  it("returns downed and out players at wave end at 30 percent hp", () => {
    const world = createWorld(5, WAVE_CONTENT);
    const downed = addPlayer(world, "downed");
    const out = addPlayer(world, "out");
    downed.downed = true;
    downed.hp = 0;
    downed.bleedOutTicks = 100;
    out.out = true;
    out.hp = 0;
    world.run.phaseTicksLeft = 1;

    tick(world, new Map());

    for (const player of [downed, out]) {
      expect(player.downed).toBe(false);
      expect(player.out).toBe(false);
      expect(player.hp).toBe(Math.round(player.maxHp * REVIVE_HP_FRACTION));
      expect(player.bleedOutTicks).toBe(0);
      expect(player.reviveProgressTicks).toBe(0);
      expect(player.pos.x).toBeGreaterThanOrEqual(2.15);
      expect(player.pos.x).toBeLessThanOrEqual(2.85);
    }
    expect(world.run.phase).toBe("build");
  });
});

describe("downed defeat", () => {
  it("defeats when a solo player is downed", () => {
    const world = createWorld(6, TEST_CONTENT);
    const player = addPlayer(world, "p1");
    player.hp = 0;

    tick(world, new Map());

    expect(player.downed).toBe(true);
    expect(world.run.phase).toBe("defeat");
  });

  it("defeats a party only when every player is downed or out", () => {
    const world = createWorld(7, TEST_CONTENT);
    const p1 = addPlayer(world, "p1");
    const p2 = addPlayer(world, "p2");
    p1.hp = 0;

    tick(world, new Map([["p2", IDLE_INPUT]]));

    expect(p1.downed).toBe(true);
    expect(world.run.phase).toBe("combat");

    p2.hp = 0;
    tick(world, new Map());

    expect(p2.downed).toBe(true);
    expect(world.run.phase).toBe("defeat");
  });

  it("defeats when the core is destroyed regardless of player state", () => {
    const world = createWorld(8, TEST_CONTENT);
    addPlayer(world, "p1");
    addPlayer(world, "p2");
    world.coreDestroyed = true;

    tick(world, new Map());

    expect(world.run.phase).toBe("defeat");
  });
});

describe("downed determinism", () => {
  it("keeps two-player damage and revive runs deterministic", () => {
    const runA = playDamageReviveRun();
    const runB = playDamageReviveRun();

    expect(runA).toEqual(runB);
  });
});

function playDamageReviveRun(): WorldState {
  const world = createWorld(99, TEST_CONTENT);
  const p1 = addPlayer(world, "p1");
  const p2 = addPlayer(world, "p2");
  p2.pos = { x: p1.pos.x + 0.5, y: p1.pos.y };
  p1.hp = 0;
  tick(world, new Map());

  for (let i = 0; i < REVIVE_S * TICK_RATE; i += 1) {
    tick(world, new Map([["p2", INTERACT_INPUT]]));
  }

  return world;
}

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
    attackingTileId: null,
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}

function moveRightInput(): PlayerInput {
  return {
    movement: { x: 1, y: 0 },
    dash: false,
    interact: false
  };
}
