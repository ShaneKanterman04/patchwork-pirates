import {
  BETWEEN_CHUM,
  BETWEEN_S,
  HEAD_WINDOW_S,
  KRAKEN_HP,
  TENTACLE_COUNT,
  TENTACLE_PHASE_S,
  TICK_RATE
} from "./constants";
import { createEnemy } from "./enemies";
import type { EnemyState, Vec2, WorldState } from "./types";

const TENTACLE_ENEMY_ID = "kraken_tentacle";
const HEAD_ENEMY_ID = "kraken_head";
const CHUM_ENEMY_ID = "chum";

export function startBoss(world: WorldState): void {
  world.boss = {
    hp: KRAKEN_HP,
    maxHp: KRAKEN_HP,
    phase: "tentacles",
    phaseTicksLeft: secondsToTicks(TENTACLE_PHASE_S),
    headEnemyId: null,
    cycles: 0
  };
}

export function updateBoss(world: WorldState): void {
  const boss = world.boss;
  if (boss === null || world.run.phase !== "combat") {
    return;
  }

  if (boss.phase === "tentacles") {
    if (
      boss.phaseTicksLeft < secondsToTicks(TENTACLE_PHASE_S) &&
      livingTentacles(world).length === 0
    ) {
      removeEnemiesByType(world, TENTACLE_ENEMY_ID);
      enterHead(world);
      return;
    }

    ensureTentacles(world);
    boss.phaseTicksLeft -= 1;

    if (livingTentacles(world).length === 0 || boss.phaseTicksLeft <= 0) {
      removeEnemiesByType(world, TENTACLE_ENEMY_ID);
      enterHead(world);
    }
    return;
  }

  if (boss.phase === "head") {
    syncHeadHp(world);
    if (boss.hp <= 0) {
      defeatBoss(world);
      return;
    }

    boss.phaseTicksLeft -= 1;
    if (boss.phaseTicksLeft <= 0) {
      removeHead(world);
      boss.phase = "between";
      boss.phaseTicksLeft = secondsToTicks(BETWEEN_S);
      boss.headEnemyId = null;
      boss.cycles += 1;
      spawnBetweenChum(world);
    }
    return;
  }

  boss.phaseTicksLeft -= 1;
  if (boss.phaseTicksLeft <= 0) {
    boss.phase = "tentacles";
    boss.phaseTicksLeft = secondsToTicks(TENTACLE_PHASE_S);
  }
}

export function updateBossAfterSim(world: WorldState): void {
  const boss = world.boss;
  if (boss === null || boss.phase !== "head") {
    return;
  }

  syncHeadHp(world);
  if (boss.hp <= 0) {
    defeatBoss(world);
  }
}

function enterHead(world: WorldState): void {
  const boss = world.boss;
  const def = world.content.enemies[HEAD_ENEMY_ID];
  if (boss === null || def === undefined) {
    return;
  }

  const head = createEnemy(world, def, headPosition(world, boss.cycles));
  head.hp = boss.hp;
  head.maxHp = boss.maxHp;
  world.enemies.push(head);
  boss.phase = "head";
  boss.phaseTicksLeft = secondsToTicks(HEAD_WINDOW_S);
  boss.headEnemyId = head.id;
}

function ensureTentacles(world: WorldState): void {
  const boss = world.boss;
  const def = world.content.enemies[TENTACLE_ENEMY_ID];
  if (boss === null || def === undefined) {
    return;
  }

  const tentacles = livingTentacles(world);
  for (let index = 0; index < TENTACLE_COUNT; index += 1) {
    const pos = tentaclePosition(world, boss.cycles, index);
    const occupied = tentacles.some((tentacle) => samePos(tentacle.pos, pos));
    if (!occupied) {
      world.enemies.push(createEnemy(world, def, pos));
    }
  }
}

function spawnBetweenChum(world: WorldState): void {
  const def = world.content.enemies[CHUM_ENEMY_ID];
  if (def === undefined) {
    return;
  }

  for (let index = 0; index < BETWEEN_CHUM; index += 1) {
    world.enemies.push(createEnemy(world, def, chumPosition(world, index)));
  }
}

function syncHeadHp(world: WorldState): void {
  const boss = world.boss;
  if (boss === null || boss.headEnemyId === null) {
    return;
  }

  const head = world.enemies.find((enemy) => enemy.id === boss.headEnemyId);
  if (head === undefined) {
    return;
  }

  boss.hp = Math.min(boss.hp, head.hp);
  head.hp = boss.hp;
  head.maxHp = boss.maxHp;
}

function defeatBoss(world: WorldState): void {
  world.run.phase = "victory";
  world.run.phaseTicksLeft = 0;
  world.run.budgetRemaining = 0;
  world.run.spawnTimer = 0;
  world.run.readyPlayerIds = [];
  world.boss = null;
  world.enemies = [];
  world.projectiles = world.projectiles.filter(
    (projectile) => projectile.faction !== "enemy"
  );
}

function removeHead(world: WorldState): void {
  const boss = world.boss;
  if (boss === null || boss.headEnemyId === null) {
    return;
  }

  world.enemies = world.enemies.filter((enemy) => enemy.id !== boss.headEnemyId);
}

function removeEnemiesByType(world: WorldState, type: string): void {
  world.enemies = world.enemies.filter((enemy) => enemy.type !== type);
}

function livingTentacles(world: WorldState): EnemyState[] {
  return world.enemies.filter(
    (enemy) => enemy.type === TENTACLE_ENEMY_ID && enemy.hp > 0
  );
}

function tentaclePosition(world: WorldState, cycle: number, index: number): Vec2 {
  return edgePosition(world, (cycle + index) % 4);
}

function headPosition(world: WorldState, cycle: number): Vec2 {
  return edgePosition(world, (cycle + 3) % 4);
}

function chumPosition(world: WorldState, index: number): Vec2 {
  return edgePosition(world, index % 4, (index + 1) / (BETWEEN_CHUM + 1));
}

function edgePosition(world: WorldState, edge: number, offset = 0.5): Vec2 {
  if (edge === 0) {
    return {
      x: world.raft.minCol + offset * world.raft.width,
      y: world.raft.minRow - 0.2
    };
  }

  if (edge === 1) {
    return {
      x: world.raft.maxCol + 1.2,
      y: world.raft.minRow + offset * world.raft.height
    };
  }

  if (edge === 2) {
    return {
      x: world.raft.minCol + offset * world.raft.width,
      y: world.raft.maxRow + 1.2
    };
  }

  return {
    x: world.raft.minCol - 0.2,
    y: world.raft.minRow + offset * world.raft.height
  };
}

function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

function samePos(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}
