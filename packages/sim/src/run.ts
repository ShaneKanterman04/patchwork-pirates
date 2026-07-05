import {
  BUILD_DURATION_S,
  MAX_ENEMIES,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  SPAWN_INTERVAL_TICKS,
  TICK_RATE
} from "./constants";
import { createEnemy } from "./enemies";
import { nextRandom } from "./world";
import type {
  EnemyDef,
  RunState,
  Vec2,
  WaveDef,
  WaveSpawnEntry,
  WorldState
} from "./types";

const MAX_WAVES = 8;
const EDGE_SURGE_CHANCE = 0.15;

export function createRunState(world: Pick<WorldState, "content" | "players">): RunState {
  const waveDef = currentWaveDef({ content: world.content, run: { wave: 1 } });

  return {
    phase: "combat",
    wave: 1,
    phaseTicksLeft: waveDef === undefined ? 0 : secondsToTicks(waveDef.durationS),
    budgetRemaining: waveDef === undefined ? 0 : scaledBudget(waveDef, world),
    spawnTimer: waveDef === undefined ? 0 : SPAWN_INTERVAL_TICKS,
    readyPlayerIds: []
  };
}

export function setPlayerReady(
  world: WorldState,
  playerId: string,
  ready: boolean
): void {
  if (world.run.phase !== "build") {
    return;
  }

  const readyIds = world.run.readyPlayerIds;
  const existingIndex = readyIds.indexOf(playerId);

  if (ready && existingIndex === -1) {
    readyIds.push(playerId);
  } else if (!ready && existingIndex !== -1) {
    readyIds.splice(existingIndex, 1);
  }
}

export function updateRunPreSim(world: WorldState): void {
  if (world.content.waves.length === 0) {
    return;
  }

  if (world.run.phase === "combat") {
    updateCombatPhase(world);
    return;
  }

  if (world.run.phase === "build") {
    updateBuildPhase(world);
  }
}

export function updateRunPostSim(world: WorldState): void {
  if (
    world.run.phase === "victory" ||
    world.run.phase === "defeat"
  ) {
    return;
  }

  const allPlayersDown =
    world.players.length > 0 && world.players.every((player) => player.hp <= 0);

  if (world.coreDestroyed || allPlayersDown) {
    world.run.phase = "defeat";
  }
}

function updateCombatPhase(world: WorldState): void {
  updateBudgetSpawner(world);
  world.run.phaseTicksLeft -= 1;

  if (world.run.phaseTicksLeft > 0) {
    return;
  }

  world.enemies = [];
  world.projectiles = world.projectiles.filter(
    (projectile) => projectile.faction !== "enemy"
  );

  if (world.run.wave >= MAX_WAVES) {
    world.run.phase = "victory";
    world.run.phaseTicksLeft = 0;
    world.run.budgetRemaining = 0;
    world.run.spawnTimer = 0;
    world.run.readyPlayerIds = [];
    return;
  }

  world.run.phase = "build";
  world.run.phaseTicksLeft = secondsToTicks(BUILD_DURATION_S);
  world.run.spawnTimer = 0;
  world.run.readyPlayerIds = [];
}

function updateBuildPhase(world: WorldState): void {
  world.run.phaseTicksLeft -= 1;

  const allPlayersReady =
    world.players.length > 0 &&
    world.players.every((player) => world.run.readyPlayerIds.includes(player.id));

  if (world.run.phaseTicksLeft > 0 && !allPlayersReady) {
    return;
  }

  loadWave(world, world.run.wave + 1);
}

function loadWave(world: WorldState, wave: number): void {
  const waveDef = world.content.waves[wave - 1];
  if (waveDef === undefined) {
    return;
  }

  world.run.phase = "combat";
  world.run.wave = wave;
  world.run.phaseTicksLeft = secondsToTicks(waveDef.durationS);
  world.run.budgetRemaining = scaledBudget(waveDef, world);
  world.run.spawnTimer = 0;
  world.run.readyPlayerIds = [];
}

function updateBudgetSpawner(world: WorldState): void {
  world.run.spawnTimer -= 1;
  if (world.run.spawnTimer > 0) {
    return;
  }

  world.run.spawnTimer = SPAWN_INTERVAL_TICKS;

  const waveDef = currentWaveDef(world);
  if (
    waveDef === undefined ||
    world.run.budgetRemaining <= 0 ||
    world.enemies.length >= MAX_ENEMIES
  ) {
    return;
  }

  const entry = weightedSpawnEntry(world, waveDef);
  if (entry === null) {
    return;
  }

  const def = world.content.enemies[entry.enemyId];
  if (def === undefined) {
    return;
  }

  const enemy = createEnemy(world, scaledEnemyDef(def, world), spawnPosition(world));
  world.enemies.push(enemy);
  world.run.budgetRemaining -= entry.cost;
}

function weightedSpawnEntry(
  world: WorldState,
  waveDef: WaveDef
): WaveSpawnEntry | null {
  const affordable = waveDef.table.filter(
    (entry) => entry.cost <= world.run.budgetRemaining && entry.weight > 0
  );

  const totalWeight = affordable.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  let cursor = nextRandom(world) * totalWeight;
  for (const entry of affordable) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entry;
    }
  }

  return affordable[affordable.length - 1] ?? null;
}

function spawnPosition(world: WorldState): Vec2 {
  const spawnAttempt = Math.floor(world.tick / SPAWN_INTERVAL_TICKS);
  const baseEdge = spawnAttempt % 4;
  const edge =
    nextRandom(world) < EDGE_SURGE_CHANCE ? (baseEdge + 3) % 4 : baseEdge;
  const offset = nextRandom(world);

  if (edge === 0) {
    return { x: offset * RAFT_WIDTH, y: -1 };
  }

  if (edge === 1) {
    return { x: RAFT_WIDTH + 1, y: offset * RAFT_HEIGHT };
  }

  if (edge === 2) {
    return { x: offset * RAFT_WIDTH, y: RAFT_HEIGHT + 1 };
  }

  return { x: -1, y: offset * RAFT_HEIGHT };
}

function scaledEnemyDef(def: EnemyDef, world: WorldState): EnemyDef {
  const hpScale = 1 + 0.3 * (playerCount(world) - 1);
  const maxHp = Math.round(def.maxHp * hpScale);

  return {
    ...def,
    maxHp
  };
}

function scaledBudget(waveDef: WaveDef, world: Pick<WorldState, "players">): number {
  return Math.round(waveDef.budget * (1 + 0.7 * (playerCount(world) - 1)));
}

function playerCount(world: Pick<WorldState, "players">): number {
  return Math.max(1, world.players.length);
}

function currentWaveDef(
  world: Pick<WorldState, "content"> & { run: Pick<RunState, "wave"> }
): WaveDef | undefined {
  return world.content.waves[world.run.wave - 1];
}

function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
