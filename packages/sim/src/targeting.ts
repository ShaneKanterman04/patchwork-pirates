import {
  CLUSTER_RADIUS,
  DISTANCE_PENALTY,
  ELITE_BONUS,
  RAFT_ATTACK_BONUS
} from "./constants";
import type { EnemyState, PlayerState, WeaponDef, WorldState } from "./types";

export function selectTarget(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef
): EnemyState | null {
  const targeting =
    wielder.special === "harpoon_raft_priority" &&
    def.tags?.includes("harpoon") === true
      ? "attacking_raft"
      : def.targeting;

  if (targeting === "nearest") {
    return selectNearestTarget(world, wielder, def);
  }

  if (targeting === "attacking_raft") {
    return selectAttackingRaftTarget(world, wielder, def);
  }

  if (targeting === "densest_cluster") {
    return selectDensestClusterTarget(world, wielder, def);
  }

  throw new Error(`targeting mode not implemented: ${targeting}`);
}

export function threatScore(
  world: WorldState,
  wielder: PlayerState,
  enemy: EnemyState
): number {
  const def = world.content.enemies[enemy.type];
  const basePriority = def?.basePriority ?? 0;
  const raftAttackBonus =
    enemy.attackingTileId !== null ? RAFT_ATTACK_BONUS : 0;
  const eliteBonus = def?.elite === true ? ELITE_BONUS : 0;
  const bossBonus = 0;
  const distancePenalty = distance(wielder.pos, enemy.pos) * DISTANCE_PENALTY;

  return basePriority + raftAttackBonus + eliteBonus + bossBonus - distancePenalty;
}

function selectNearestTarget(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef
): EnemyState | null {
  let selected: EnemyState | null = null;
  let selectedDistance = Infinity;

  for (const enemy of world.enemies) {
    const distanceToEnemy = distance(wielder.pos, enemy.pos);

    if (distanceToEnemy > def.rangeTiles + enemy.radius) {
      continue;
    }

    if (distanceToEnemy < selectedDistance) {
      selected = enemy;
      selectedDistance = distanceToEnemy;
    }
  }

  return selected;
}

function selectAttackingRaftTarget(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef
): EnemyState | null {
  let selected: EnemyState | null = null;
  let selectedScore = -Infinity;

  for (const enemy of world.enemies) {
    if (enemy.attackingTileId === null) {
      continue;
    }

    if (!isInRange(wielder, def, enemy)) {
      continue;
    }

    const score = threatScore(world, wielder, enemy);
    if (score > selectedScore) {
      selected = enemy;
      selectedScore = score;
    }
  }

  return selected ?? selectNearestTarget(world, wielder, def);
}

function selectDensestClusterTarget(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef
): EnemyState | null {
  let selected: EnemyState | null = null;
  let selectedNeighborCount = -1;
  let selectedDistance = Infinity;

  for (const enemy of world.enemies) {
    const distanceToEnemy = distance(wielder.pos, enemy.pos);
    if (distanceToEnemy > def.rangeTiles + enemy.radius) {
      continue;
    }

    const neighborCount = countNeighbors(world, enemy);
    if (
      neighborCount > selectedNeighborCount ||
      (neighborCount === selectedNeighborCount &&
        distanceToEnemy < selectedDistance)
    ) {
      selected = enemy;
      selectedNeighborCount = neighborCount;
      selectedDistance = distanceToEnemy;
    }
  }

  return selected;
}

function countNeighbors(world: WorldState, target: EnemyState): number {
  let count = 0;

  for (const enemy of world.enemies) {
    if (enemy === target) {
      continue;
    }

    if (distance(enemy.pos, target.pos) <= CLUSTER_RADIUS) {
      count += 1;
    }
  }

  return count;
}

function isInRange(
  wielder: PlayerState,
  def: WeaponDef,
  enemy: EnemyState
): boolean {
  return distance(wielder.pos, enemy.pos) <= def.rangeTiles + enemy.radius;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
