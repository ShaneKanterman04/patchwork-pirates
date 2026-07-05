import { describe, expect, it } from "vitest";

import { TICK_RATE, addPlayer, createWorld, tick } from "@patchwork/sim";
import type {
  EnemyDef,
  EnemyState,
  PlayerInput,
  Vec2,
  WorldState
} from "@patchwork/sim";

import { CONTENT } from "./index";

describe("content determinism", () => {
  it("replays cutlass and chum simulation deterministically", () => {
    const first = createWorld(99, CONTENT);
    const second = createWorld(99, CONTENT);
    addPlayer(first, "p1", ["cutlass", "harpoon_gun", "coconut_launcher"]);
    addPlayer(second, "p1", ["cutlass", "harpoon_gun", "coconut_launcher"]);
    addContentEnemies(first);
    addContentEnemies(second);

    for (let i = 0; i < 200; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect({
      run: first.run,
      players: first.players,
      enemies: first.enemies,
      pickups: first.pickups,
      projectiles: first.projectiles
    }).toEqual({
      run: second.run,
      players: second.players,
      enemies: second.enemies,
      pickups: second.pickups,
      projectiles: second.projectiles
    });
  });

  it("replays weighted wave draws and player scaling deterministically", () => {
    const first = createWorld(123, CONTENT);
    const second = createWorld(123, CONTENT);
    addPlayer(first, "p1");
    addPlayer(first, "p2");
    addPlayer(second, "p1");
    addPlayer(second, "p2");
    const firstWave = CONTENT.waves[0];
    if (firstWave === undefined) {
      throw new Error("missing wave 1 content");
    }

    first.run.budgetRemaining = Math.round(firstWave.budget * 1.7);
    second.run.budgetRemaining = Math.round(firstWave.budget * 1.7);

    for (let i = 0; i < 60; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect(first.enemies.length).toBeGreaterThan(0);
    const enemyDefs: Record<string, EnemyDef> = CONTENT.enemies;
    expect(
      first.enemies.some((enemy) => {
        const def = enemyDefs[enemy.type];
        return def !== undefined && enemy.maxHp > def.maxHp;
      })
    ).toBe(true);
    expect({
      run: first.run,
      players: first.players,
      enemies: first.enemies,
      pickups: first.pickups,
      projectiles: first.projectiles
    }).toEqual({
      run: second.run,
      players: second.players,
      enemies: second.enemies,
      pickups: second.pickups,
      projectiles: second.projectiles
    });
  });
});

function replayInput(tickIndex: number): Map<string, PlayerInput> {
  const movement =
    tickIndex % 4 === 0
      ? { x: 1, y: 0 }
      : tickIndex % 4 === 1
        ? { x: 0, y: 1 }
        : tickIndex % 4 === 2
          ? { x: -1, y: 0 }
          : { x: 0, y: -1 };

  return new Map([
    [
      "p1",
      {
        movement,
        dash: tickIndex === 7 || tickIndex === 93,
        interact: tickIndex % 13 === 0
      }
    ]
  ]);
}

function addContentEnemies(world: WorldState): void {
  addEnemy(world, "seed_spitter", "spitter_crab", { x: 4.5, y: 1.5 });
  addEnemy(world, "seed_biter", "plank_biter", { x: -0.2, y: 0.5 });
  addEnemy(world, "seed_brute", "brute_turtle", { x: 3.5, y: 2.5 });
}

function addEnemy(
  world: WorldState,
  id: string,
  type: "spitter_crab" | "plank_biter" | "brute_turtle",
  pos: Vec2
): EnemyState {
  const def = CONTENT.enemies[type];

  const enemy: EnemyState = {
    id,
    type,
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: def.radius,
    speed: def.speedTilesPerSec,
    contactDamage: def.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(behaviorCooldownS(def) * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}

function behaviorCooldownS(def: (typeof CONTENT.enemies)[keyof typeof CONTENT.enemies]): number {
  if (def.behavior.kind === "swarmer_melee") {
    return def.contactCooldownS;
  }

  return def.behavior.attackCooldownS;
}
