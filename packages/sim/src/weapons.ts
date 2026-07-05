import { MARK_DAMAGE_MULT, TICK_RATE } from "./constants";
import { selectTarget } from "./targeting";
import type {
  EnemyState,
  PlayerState,
  ProjectileState,
  Vec2,
  WeaponDef,
  WeaponInstance,
  WorldState
} from "./types";

export function updatePlayerWeapons(world: WorldState): void {
  for (const player of world.players) {
    if (player.downed || player.out || player.hp <= 0) {
      continue;
    }

    for (const [slot, weapon] of player.weapons.entries()) {
      const def = world.content.weapons[weapon.defId];

      if (
        def !== undefined &&
        weapon.cooldownTicks === 0 &&
        (def.pattern.kind === "trail" || def.pattern.kind === "trap")
      ) {
        fireWeapon(world, player, weapon, def);
        weapon.cooldownTicks = Math.max(0, weapon.cooldownTicks - 1);
        continue;
      }

      if (def?.pattern.kind === "orbit") {
        updateOrbitWeapon(world, player, weapon, def, slot);
        continue;
      }

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
  if (def.pattern.kind === "trail") {
    dropTrailPuddle(world, wielder, weapon, def);
    return;
  }

  if (def.pattern.kind === "trap") {
    placeTrap(world, wielder, weapon, def);
    return;
  }

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
    return;
  }

  if (def.pattern.kind === "dive") {
    fireDive(world, wielder, weapon, def, target);
  }
}

function dropTrailPuddle(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef
): void {
  if (def.pattern.kind !== "trail") {
    return;
  }

  const lastDropPos = weapon.lastDropPos;
  if (lastDropPos === undefined) {
    weapon.lastDropPos = { ...wielder.pos };
    weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
    return;
  }

  if (distance(lastDropPos, wielder.pos) < def.pattern.minMoveTiles) {
    weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
    return;
  }

  world.hazards.push({
    id: nextHazardId(world),
    kind: "puddle",
    ownerId: wielder.id,
    pos: { ...wielder.pos },
    radius: def.pattern.puddleRadius,
    ttlTicks: Math.round(def.pattern.puddleTtlS * TICK_RATE),
    damage: scaledDamage({ ...def, damage: def.pattern.dps }, wielder),
    slowFactor: def.pattern.slowFactor,
    slowDurationTicks: Math.max(1, Math.round(0.3 * TICK_RATE))
  });
  weapon.lastDropPos = { ...wielder.pos };
  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
}

function placeTrap(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef
): void {
  if (def.pattern.kind !== "trap") {
    return;
  }

  const activeTraps = world.hazards.filter(
    (hazard) => hazard.kind === "trap" && hazard.ownerId === wielder.id
  );
  if (activeTraps.length >= def.pattern.maxActive) {
    const oldest = activeTraps[0];
    world.hazards = world.hazards.filter((hazard) => hazard.id !== oldest?.id);
  }

  world.hazards.push({
    id: nextHazardId(world),
    kind: "trap",
    ownerId: wielder.id,
    pos: { ...wielder.pos },
    radius: def.pattern.trapRadius,
    ttlTicks: Math.round(60 * TICK_RATE),
    damage: scaledDamage({ ...def, damage: def.pattern.trapDamage }, wielder),
    slowFactor: 0,
    slowDurationTicks: Math.round(def.pattern.rootS * TICK_RATE)
  });
  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
}

function updateOrbitWeapon(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef,
  slot: number
): void {
  if (def.pattern.kind !== "orbit") {
    return;
  }

  const projectile = ensureOrbitProjectile(world, wielder, def, slot);
  projectile.pos = orbitPos(world, wielder, def, slot);

  if (weapon.cooldownTicks === 0 && pulseOrbit(world, wielder, def, projectile)) {
    weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
  }

  weapon.cooldownTicks = Math.max(0, weapon.cooldownTicks - 1);
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

    const damage = markedDamage(scaledDamage(def, wielder), enemy);
    enemy.hp -= damage;
    wielder.stats.damageDealt += damage;
    world.events.push({
      type: "enemy_hit",
      enemyId: enemy.id,
      damage,
      pos: { ...enemy.pos }
    });
  }

  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
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
    faction: "player",
    pos: { ...wielder.pos },
    vel: { x: direction.x * speed, y: direction.y * speed },
    damage: scaledDamage(def, wielder),
    tileDamage: 0,
    ttl: projectileTtl(def.rangeTiles, speed),
    ownerId: wielder.id,
    homing: def.pattern.homing,
    targetId: def.pattern.homing ? target.id : null,
    landPos: null,
    aoeRadius: 0,
    effect: def.pattern.effect ?? null,
    pullDistance: def.pattern.pullDistance ?? 0,
    slowFactor: def.pattern.slowFactor ?? 1,
    slowDurationTicks: Math.round((def.pattern.slowDurationS ?? 0) * TICK_RATE),
    persistent: false
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

  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
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
    faction: "player",
    pos: { ...wielder.pos },
    vel: { x: direction.x * speed, y: direction.y * speed },
    damage: scaledDamage(def, wielder),
    tileDamage: 0,
    ttl: projectileTtl(distance(wielder.pos, landPos), speed),
    ownerId: wielder.id,
    homing: false,
    targetId: null,
    landPos,
    aoeRadius: def.pattern.aoeRadius,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0,
    persistent: false
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

  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
}

function fireDive(
  world: WorldState,
  wielder: PlayerState,
  weapon: WeaponInstance,
  def: WeaponDef,
  target: EnemyState
): void {
  if (def.pattern.kind !== "dive") {
    return;
  }

  const speed = def.pattern.projectileSpeed;
  const landPos = { ...target.pos };
  const origin = { x: target.pos.x, y: target.pos.y - 3.5 };
  const direction = { x: 0, y: 1 };

  world.projectiles.push({
    id: nextProjectileId(world),
    type: def.id,
    faction: "player",
    pos: origin,
    vel: { x: 0, y: speed },
    damage: scaledDamage(def, wielder),
    tileDamage: 0,
    ttl: projectileTtl(3.5, speed),
    ownerId: wielder.id,
    homing: false,
    targetId: null,
    landPos,
    aoeRadius: def.pattern.aoeRadius,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0,
    persistent: false
  });

  world.events.push({
    type: "weapon_fired",
    wielderId: wielder.id,
    weaponId: def.id,
    origin,
    dir: direction,
    arcDegrees: 0,
    range: def.rangeTiles
  });

  weapon.cooldownTicks = scaledCooldownTicks(def, wielder);
}

function ensureOrbitProjectile(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef,
  slot: number
): ProjectileState {
  const id = orbitProjectileId(wielder.id, slot);
  const existing = world.projectiles.find((projectile) => projectile.id === id);
  if (existing !== undefined) {
    return existing;
  }

  const projectile: ProjectileState = {
    id,
    type: def.id,
    faction: "player",
    pos: orbitPos(world, wielder, def, slot),
    vel: { x: 0, y: 0 },
    damage: scaledDamage(def, wielder),
    tileDamage: 0,
    ttl: Number.MAX_SAFE_INTEGER,
    ownerId: wielder.id,
    homing: false,
    targetId: null,
    landPos: null,
    aoeRadius: 0,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0,
    persistent: true
  };
  world.projectiles.push(projectile);
  return projectile;
}

function pulseOrbit(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef,
  projectile: ProjectileState
): boolean {
  if (def.pattern.kind !== "orbit") {
    return false;
  }

  let didHit = false;
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    if (distance(projectile.pos, enemy.pos) > def.pattern.hitRadius + enemy.radius) {
      continue;
    }

    const damage = markedDamage(scaledDamage(def, wielder), enemy);
    enemy.hp -= damage;
    wielder.stats.damageDealt += damage;
    didHit = true;
    world.events.push({
      type: "enemy_hit",
      enemyId: enemy.id,
      damage,
      pos: { ...enemy.pos }
    });
  }

  return didHit;
}

function orbitPos(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef,
  slot: number
): Vec2 {
  if (def.pattern.kind !== "orbit") {
    return { ...wielder.pos };
  }

  const periodTicks = Math.max(
    1,
    Math.round(def.pattern.orbitPeriodS * TICK_RATE)
  );
  // Offset stacked copies by slot so duplicate flails spread around the
  // wielder instead of overlapping into one invisible double-damage anchor.
  const slotPhase = (slot % 4) * (Math.PI / 2);
  const theta = (2 * Math.PI * (world.tick % periodTicks)) / periodTicks + slotPhase;

  return {
    x: wielder.pos.x + Math.cos(theta) * def.pattern.orbitRadius,
    y: wielder.pos.y + Math.sin(theta) * def.pattern.orbitRadius
  };
}

function orbitProjectileId(playerId: string, slot: number): string {
  return `orbit:${playerId}:${slot}`;
}

function scaledDamage(def: WeaponDef, wielder: PlayerState): number {
  return def.damage * wielder.damageMult;
}

function scaledCooldownTicks(def: WeaponDef, wielder: PlayerState): number {
  return Math.max(
    1,
    Math.round(
      (def.cooldownS * TICK_RATE) /
        (wielder.attackSpeedMult * wielder.auraAttackSpeedMult)
    )
  );
}

function markedDamage(baseDamage: number, enemy: EnemyState): number {
  return enemy.markTicks > 0 ? baseDamage * MARK_DAMAGE_MULT : baseDamage;
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

function nextHazardId(world: WorldState): string {
  const id = `h${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}
