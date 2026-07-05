import { describe, expect, it } from "vitest";

import { TICK_RATE, addPlayer, createWorld, selectTarget, threatScore } from "./index";
import type {
  ContentRegistry,
  EnemyState,
  Vec2,
  WeaponDef,
  WorldState
} from "./index";

const NEAREST: WeaponDef = {
  id: "nearest",
  name: "Nearest",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 1,
  rangeTiles: 5,
  damage: 1,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
};

const ATTACKING_RAFT: WeaponDef = {
  ...NEAREST,
  id: "attacking_raft",
  targeting: "attacking_raft"
};

const DENSEST_CLUSTER: WeaponDef = {
  ...NEAREST,
  id: "densest_cluster",
  targeting: "densest_cluster"
};

const CONTENT: ContentRegistry = {
  weapons: {},
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
      coinValue: 1,
      heavy: false,
      basePriority: 0,
      elite: false,
      behavior: { kind: "swarmer_melee" }
    }
  },
  modules: {},
  waves: []
};

describe("targeting modes", () => {
  it("densest_cluster picks the enemy with the most neighbors", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    addEnemy(world, "nearSparse", { x: player.pos.x + 0.5, y: player.pos.y });
    const dense = addEnemy(world, "dense", { x: player.pos.x + 2, y: player.pos.y });
    addEnemy(world, "denseNeighbor1", {
      x: dense.pos.x + 0.3,
      y: dense.pos.y
    });
    addEnemy(world, "denseNeighbor2", {
      x: dense.pos.x,
      y: dense.pos.y + 0.4
    });

    expect(selectTarget(world, player, DENSEST_CLUSTER)).toBe(dense);
  });

  it("attacking_raft falls back to nearest when no enemy is flagged", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    addEnemy(world, "far", { x: player.pos.x + 2, y: player.pos.y });
    const near = addEnemy(world, "near", { x: player.pos.x + 0.8, y: player.pos.y });

    expect(selectTarget(world, player, ATTACKING_RAFT)).toBe(near);
  });

  it("attacking_raft prefers a flagged enemy in range", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    const near = addEnemy(world, "near", { x: player.pos.x + 0.8, y: player.pos.y });
    const flagged = addEnemy(world, "flagged", {
      x: player.pos.x + 2,
      y: player.pos.y
    });
    flagged.attackingTileId = "2,2";

    expect(selectTarget(world, player, ATTACKING_RAFT)).toBe(flagged);
    expect(selectTarget(world, player, ATTACKING_RAFT)).not.toBe(near);
  });

  it("orders threat by raft attacks and distance", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    const plain = addEnemy(world, "plain", { x: player.pos.x + 1, y: player.pos.y });
    const attacker = addEnemy(world, "attacker", {
      x: player.pos.x + 2,
      y: player.pos.y
    });
    attacker.attackingTileId = "1,1";
    const far = addEnemy(world, "far", { x: player.pos.x + 3, y: player.pos.y });

    expect(threatScore(world, player, attacker)).toBeGreaterThan(
      threatScore(world, player, plain)
    );
    expect(threatScore(world, player, plain)).toBeGreaterThan(
      threatScore(world, player, far)
    );
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
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}
