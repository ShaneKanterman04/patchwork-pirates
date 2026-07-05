import {
  PLAYER_RADIUS,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TICK_RATE
} from "./constants";
import { isWalkable } from "./raft";
import type { EnemyState, ProjectileState, Vec2, WorldState } from "./types";

const PROJECTILE_HIT_RADIUS = 0.25;
const LOB_ARRIVAL_EPSILON = 0.05;

export function updateProjectiles(world: WorldState): void {
  const survivors: ProjectileState[] = [];

  for (const projectile of world.projectiles) {
    if (projectile.landPos !== null) {
      updateLob(world, projectile, survivors);
    } else {
      updateDirectProjectile(world, projectile, survivors);
    }
  }

  world.projectiles = survivors;
}

function updateDirectProjectile(
  world: WorldState,
  projectile: ProjectileState,
  survivors: ProjectileState[]
): void {
  if (projectile.homing && projectile.targetId !== null) {
    const target = world.enemies.find((enemy) => enemy.id === projectile.targetId);
    if (target !== undefined) {
      const direction = normalize({
        x: target.pos.x - projectile.pos.x,
        y: target.pos.y - projectile.pos.y
      });
      const speed = magnitude(projectile.vel);
      projectile.vel = {
        x: direction.x * speed,
        y: direction.y * speed
      };
    }
  }

  move(projectile);

  const hit = firstProjectileHit(world, projectile);
  if (hit !== null) {
    hit.hp -= projectile.damage;
    world.events.push({
      type: "enemy_hit",
      enemyId: hit.id,
      damage: projectile.damage,
      pos: { ...hit.pos }
    });

    applyProjectileEffect(world, projectile, hit);
    return;
  }

  projectile.ttl -= 1;
  if (projectile.ttl > 0) {
    survivors.push(projectile);
  }
}

function updateLob(
  world: WorldState,
  projectile: ProjectileState,
  survivors: ProjectileState[]
): void {
  if (projectile.landPos === null) {
    return;
  }

  const distanceToLand = distance(projectile.pos, projectile.landPos);
  const step = magnitude(projectile.vel) / TICK_RATE;

  if (distanceToLand <= step) {
    projectile.pos = { ...projectile.landPos };
  } else {
    move(projectile);
  }

  if (
    distance(projectile.pos, projectile.landPos) <= LOB_ARRIVAL_EPSILON ||
    projectile.ttl <= 1
  ) {
    explode(world, projectile, projectile.landPos);
    return;
  }

  projectile.ttl -= 1;
  survivors.push(projectile);
}

function firstProjectileHit(
  world: WorldState,
  projectile: ProjectileState
): EnemyState | null {
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    if (distance(projectile.pos, enemy.pos) <= PROJECTILE_HIT_RADIUS + enemy.radius) {
      return enemy;
    }
  }

  return null;
}

function applyProjectileEffect(
  world: WorldState,
  projectile: ProjectileState,
  enemy: EnemyState
): void {
  if (projectile.effect !== "pull_or_slow") {
    return;
  }

  const def = world.content.enemies[enemy.type];
  if (def?.heavy === true) {
    enemy.slowTicks = projectile.slowDurationTicks;
    enemy.slowFactor = projectile.slowFactor;
    return;
  }

  const owner = world.players.find((player) => player.id === projectile.ownerId);
  if (owner === undefined) {
    return;
  }

  const offset = {
    x: owner.pos.x - enemy.pos.x,
    y: owner.pos.y - enemy.pos.y
  };
  const pullDistance = Math.min(projectile.pullDistance, magnitude(offset));
  const direction = normalize(offset);
  const candidate = clampEnemyToRaft({
    x: enemy.pos.x + direction.x * pullDistance,
    y: enemy.pos.y + direction.y * pullDistance
  });

  if (isWalkable(world.raft, candidate.x, candidate.y)) {
    enemy.pos = candidate;
  }
}

function explode(
  world: WorldState,
  projectile: ProjectileState,
  pos: Vec2
): void {
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    if (distance(pos, enemy.pos) > projectile.aoeRadius + enemy.radius) {
      continue;
    }

    enemy.hp -= projectile.damage;
    world.events.push({
      type: "enemy_hit",
      enemyId: enemy.id,
      damage: projectile.damage,
      pos: { ...enemy.pos }
    });
  }

  world.events.push({
    type: "explosion",
    pos: { ...pos },
    radius: projectile.aoeRadius
  });
}

function move(projectile: ProjectileState): void {
  projectile.pos = {
    x: projectile.pos.x + projectile.vel.x / TICK_RATE,
    y: projectile.pos.y + projectile.vel.y / TICK_RATE
  };
}

function clampEnemyToRaft(pos: Vec2): Vec2 {
  return {
    x: clamp(pos.x, PLAYER_RADIUS, RAFT_WIDTH - PLAYER_RADIUS),
    y: clamp(pos.y, PLAYER_RADIUS, RAFT_HEIGHT - PLAYER_RADIUS)
  };
}

function normalize(vector: Vec2): Vec2 {
  const length = magnitude(vector);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function magnitude(vector: Vec2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function distance(a: Vec2, b: Vec2): number {
  return magnitude({ x: a.x - b.x, y: a.y - b.y });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
