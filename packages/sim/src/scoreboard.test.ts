import { describe, expect, it } from "vitest";

import {
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

describe("scoreboard stats", () => {
  it("credits weapon damage to the wielder", () => {
    const world = createWorld(1, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1", ["cutlass"]);
    addEnemy(world, "e1", { x: player.pos.x + 1, y: player.pos.y });

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(player.stats.damageDealt).toBe(18);
  });

  it("credits player-held repairs when a broken tile is rebuilt", () => {
    const world = createWorld(2, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    // Repairs only run during the build phase now.
    world.run.phase = "build";
    world.run.phaseTicksLeft = Number.MAX_SAFE_INTEGER;
    const player = addPlayer(world, "p1");
    world.salvage = 1;
    const tile = world.raft.tiles.find(
      (candidate) =>
        candidate.col === Math.floor(player.pos.x) &&
        candidate.row === Math.floor(player.pos.y)
    );
    expect(tile).toBeDefined();
    tile!.broken = true;
    tile!.hp = tile!.maxHp - 0.5;

    while (tile!.broken) {
      tick(world, new Map([["p1", IDLE_INPUT]]));
    }

    expect(tile!.broken).toBe(false);
    expect(player.stats.tilesRepaired).toBe(1);
  });

  it("credits completed revives to the channeling reviver", () => {
    const world = createWorld(3, TEST_CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const downed = addPlayer(world, "downed");
    const reviver = addPlayer(world, "reviver");
    reviver.pos = { x: downed.pos.x + REVIVE_RANGE - 0.1, y: downed.pos.y };
    downed.hp = 0;
    tick(world, new Map());

    for (let i = 0; i < REVIVE_S * TICK_RATE; i += 1) {
      tick(world, new Map([["reviver", INTERACT_INPUT]]));
    }

    expect(downed.downed).toBe(false);
    expect(reviver.stats.revives).toBe(1);
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
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0,
    animState: "move" as const,
    attackAnimTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}
