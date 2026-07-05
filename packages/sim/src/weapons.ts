import { TICK_RATE } from "./constants";
import { selectTarget } from "./targeting";
import type {
  EnemyState,
  PlayerState,
  Vec2,
  WeaponDef,
  WeaponInstance,
  WorldState
} from "./types";

export function updatePlayerWeapons(world: WorldState): void {
  for (const player of world.players) {
    for (const weapon of player.weapons) {
      const def = world.content.weapons[weapon.defId];

      if (def !== undefined && weapon.cooldownTicks === 0) {
        fireWeapon(world, player, weapon, def);
      }

      weapon.cooldownTicks = Math.max(0, weapon.cooldownTicks - 1);
    }
  }
}

function fireWeapon(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef
): void {
  const target = selectTarget(world, wielder, def);

  if (target === null) {
    return;
  }

  if (def.pattern.kind === "melee_arc") {
    fireMeleeArc(world, wielder, weapon, def, target);
    return;
  }

  if (def.pattern.kind === "projectile") {
    fireProjectile(world, wielder, weapon, def, target);
    return;
  }

  if (def.pattern.kind === "lob") {
    fireLob(world, wielder, weapon, def, target);
  }
}

function fireMeleeArc(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef,
  target: EnemyState
): void {
  if (def.pattern.kind !== "melee_arc") {
    return;
  }

  const slashDir = directionOrFacing(wielder.pos, target.pos, wielder.facing);
  const arcDegrees = def.pattern.arcDegrees;

  world.events.push({
    type: "weapon_fired",
    wielderId: wielder.id,
    weaponId: def.id,
    origin: { ...wielder.pos },
    dir: slashDir,
    arcDegrees,
    range: def.rangeTiles
  });

  const minDot = Math.cos((arcDegrees / 2) * (Math.PI / 180));

  for (const enemy of world.enemies) {
    if (!isEnemyInMeleeArc(enemy, wielder, slashDir, def.rangeTiles, minDot)) {
      continue;
    }

    enemy.hp -= def.damage;
    world.events.push({
      type: "enemy_hit",
      enemyId: enemy.id,
      damage: def.damage,
      pos: { ...enemy.pos }
    });
  }

  weapon.cooldownTicks = Math.round(def.cooldownS * TICK_RATE);
}

function fireProjectile(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef,
  target: EnemyState
): void {
  if (def.pattern.kind !== "projectile") {
    return;
  }

  const direction = directionOrFacing(wielder.pos, target.pos, wielder.facing);
  const speed = def.pattern.projectileSpeed;

  world.projectiles.push({
    id: nextProjectileId(world),
    type: def.id,
    pos: { ...wielder.pos },
    vel: { x: direction.x * speed, y: direction.y * speed },
    damage: def.damage,
    ttl: projectileTtl(def.rangeTiles, speed),
    ownerId: wielder.id,
    homing: def.pattern.homing,
    targetId: def.pattern.homing ? target.id : null,
    landPos: null,
    aoeRadius: 0,
    effect: def.pattern.effect ?? null,
    pullDistance: def.pattern.pullDistance ?? 0,
    slowFactor: def.pattern.slowFactor ?? 1,
    slowDurationTicks: Math.round((def.pattern.slowDurationS ?? 0) * TICK_RATE)
  });

  world.events.push({
    type: "weapon_fired",
    wielderId: wielder.id,
    weaponId: def.id,
    origin: { ...wielder.pos },
    dir: direction,
    arcDegrees: 0,
    range: def.rangeTiles
  });

  weapon.cooldownTicks = Math.round(def.cooldownS * TICK_RATE);
}

function fireLob(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef,
  target: EnemyState
): void {
  if (def.pattern.kind !== "lob") {
    return;
  }

  const landPos = { ...target.pos };
  const direction = directionOrFacing(wielder.pos, landPos, wielder.facing);
  const speed = def.pattern.projectileSpeed;

  world.projectiles.push({
    id: nextProjectileId(world),
    type: def.id,
    pos: { ...wielder.pos },
    vel: { x: direction.x * speed, y: direction.y * speed },
    damage: def.damage,
    ttl: projectileTtl(distance(wielder.pos, landPos), speed),
    ownerId: wielder.id,
    homing: false,
    targetId: null,
    landPos,
    aoeRadius: def.pattern.aoeRadius,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0
  });

  world.events.push({
    type: "weapon_fired",
    wielderId: wielder.id,
    weaponId: def.id,
    origin: { ...wielder.pos },
    dir: direction,
    arcDegrees: 0,
    range: def.rangeTiles
  });

  weapon.cooldownTicks = Math.round(def.cooldownS * TICK_RATE);
}

function isEnemyInMeleeArc(
  enemy: EnemyState,
  wielder: PlayerState,
  slashDir: Vec2,
  range: number,
  minDot: number
): boolean {
  const offset = {
    x: enemy.pos.x - wielder.pos.x,
    y: enemy.pos.y - wielder.pos.y
  };
  const distanceToEnemy = magnitude(offset);

  if (distanceToEnemy > range + enemy.radius) {
    return false;
  }

  if (distanceToEnemy === 0) {
    return true;
  }

  const enemyDir = {
    x: offset.x / distanceToEnemy,
    y: offset.y / distanceToEnemy
  };

  return dot(enemyDir, slashDir) >= minDot;
}

function directionOrFacing(from: Vec2, to: Vec2, facing: Vec2): Vec2 {
  const offset = { x: to.x - from.x, y: to.y - from.y };
  const length = magnitude(offset);

  if (length === 0) {
    return { ...facing };
  }

  return {
    x: offset.x / length,
    y: offset.y / length
  };
}

function magnitude(vector: Vec2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function distance(a: Vec2, b: Vec2): number {
  return magnitude({ x: a.x - b.x, y: a.y - b.y });
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function projectileTtl(distanceTiles: number, speedTilesPerSec: number): number {
  return Math.ceil(distanceTiles / (speedTilesPerSec / TICK_RATE)) + 3;
}

function nextProjectileId(world: WorldState): string {
  const id = `p${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}
