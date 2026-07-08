import {
  BASE_SUPPLY_CAP,
  TICK_RATE
} from "./constants";
import { tileAt } from "./raft";
import type {
  EnemyState,
  ModuleBehavior,
  ModuleState,
  Vec2,
  WorldState
} from "./types";

export function placeModule(
  world: WorldState,
  defId: string,
  col: number,
  row: number
): ModuleState | null {
  const def = world.content.modules[defId];
  const tile = tileAt(world.raft, col, row);

  if (
    def === undefined ||
    tile === undefined ||
    tile.kind !== "deck" ||
    tile.broken ||
    world.modules.some((module) => module.col === col && module.row === row)
  ) {
    return null;
  }

  const module: ModuleState = {
    id: nextModuleId(world),
    defId,
    col,
    row,
    hp: def.maxHp,
    maxHp: def.maxHp,
    cooldownTicks: 0
  };

  world.modules.push(module);
  return module;
}

export function updateModules(world: WorldState): void {
  const survivors: ModuleState[] = [];

  for (const module of world.modules) {
    const tile = tileAt(world.raft, module.col, module.row);
    if (tile === undefined || tile.broken) {
      continue;
    }

    const def = world.content.modules[module.defId];
    if (def !== undefined) {
      updateModuleByBehavior(world, module, def.behavior);
    }

    survivors.push(module);
  }

  world.modules = survivors;
  world.salvage = Math.min(world.salvage, supplyCapacity(world));
}

export function supplyCapacity(world: WorldState): number {
  return world.modules.reduce((capacity, module) => {
    const behavior = world.content.modules[module.defId]?.behavior;
    if (behavior?.kind !== "supply_cache") {
      return capacity;
    }

    return capacity + behavior.capacityBonus;
  }, BASE_SUPPLY_CAP);
}

function updateModuleByBehavior(
  world: WorldState,
  module: ModuleState,
  behavior: ModuleBehavior
): void {
  switch (behavior.kind) {
    case "cannon":
      updateCannon(world, module, behavior);
      return;
    case "supply_cache":
      return;
    case "spike_rail":
      updateSpikeRail(world, module, behavior);
      return;
  }
}

function updateCannon(
  world: WorldState,
  module: ModuleState,
  behavior: Extract<ModuleBehavior, { kind: "cannon" }>
): void {
  module.cooldownTicks = Math.max(0, module.cooldownTicks - 1);
  if (module.cooldownTicks > 0) {
    return;
  }

  const origin = moduleCenter(module);
  const target = nearestEnemyInRange(world, origin, behavior.rangeTiles);
  if (target === null) {
    return;
  }

  const direction = normalize({
    x: target.pos.x - origin.x,
    y: target.pos.y - origin.y
  });

  world.projectiles.push({
    id: nextProjectileId(world),
    type: module.defId,
    faction: "player",
    pos: origin,
    vel: {
      x: direction.x * behavior.projectileSpeed,
      y: direction.y * behavior.projectileSpeed
    },
    damage: behavior.damage,
    tileDamage: 0,
    ttl: projectileTtl(behavior.rangeTiles, behavior.projectileSpeed),
    ownerId: module.id,
    homing: false,
    targetId: null,
    landPos: null,
    aoeRadius: 0,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0
  });

  module.cooldownTicks = Math.round(behavior.cooldownS * TICK_RATE);
}

function updateSpikeRail(
  world: WorldState,
  module: ModuleState,
  behavior: Extract<ModuleBehavior, { kind: "spike_rail" }>
): void {
  module.cooldownTicks = Math.max(0, module.cooldownTicks - 1);
  if (module.cooldownTicks > 0) {
    return;
  }

  const origin = moduleCenter(module);
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    if (distance(origin, enemy.pos) <= behavior.rangeTiles + enemy.radius) {
      enemy.hp -= behavior.damage;
    }
  }

  module.cooldownTicks = Math.round(behavior.cooldownS * TICK_RATE);
}

function nearestEnemyInRange(
  world: WorldState,
  pos: Vec2,
  rangeTiles: number
): EnemyState | null {
  let selected: EnemyState | null = null;
  let selectedDistance = Infinity;

  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    const distanceToEnemy = distance(pos, enemy.pos);
    if (
      distanceToEnemy <= rangeTiles + enemy.radius &&
      distanceToEnemy < selectedDistance
    ) {
      selected = enemy;
      selectedDistance = distanceToEnemy;
    }
  }

  return selected;
}

function moduleCenter(module: ModuleState): Vec2 {
  return { x: module.col + 0.5, y: module.row + 0.5 };
}

function normalize(vector: Vec2): Vec2 {
  const length = distance({ x: 0, y: 0 }, vector);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: vector.x / length, y: vector.y / length };
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function projectileTtl(distanceTiles: number, speedTilesPerSec: number): number {
  return Math.ceil(distanceTiles / (speedTilesPerSec / TICK_RATE)) + 3;
}

function nextModuleId(world: WorldState): string {
  const id = `m${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}

function nextProjectileId(world: WorldState): string {
  const id = `p${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}
