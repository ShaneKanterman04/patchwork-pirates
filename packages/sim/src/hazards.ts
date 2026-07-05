import { TICK_RATE } from "./constants";
import type { EnemyState, HazardState, PlayerState, WorldState } from "./types";

const PUDDLE_HIT_EVENT_INTERVAL_TICKS = Math.max(1, Math.round(TICK_RATE / 2));

export function updateHazards(world: WorldState): void {
  const survivors: HazardState[] = [];

  for (const hazard of world.hazards) {
    hazard.ttlTicks -= 1;
    if (hazard.ttlTicks <= 0) {
      continue;
    }

    if (hazard.kind === "puddle") {
      updatePuddle(world, hazard);
      survivors.push(hazard);
      continue;
    }

    if (!triggerTrap(world, hazard)) {
      survivors.push(hazard);
    }
  }

  world.hazards = survivors;
}

function updatePuddle(world: WorldState, hazard: HazardState): void {
  for (const enemy of world.enemies) {
    if (!enemyInHazard(enemy, hazard)) {
      continue;
    }

    const damage = hazard.damage / TICK_RATE;
    enemy.hp -= damage;
    creditDamage(world, hazard.ownerId, damage);
    enemy.slowFactor = hazard.slowFactor;
    enemy.slowTicks = hazard.slowDurationTicks;

    if (world.tick % PUDDLE_HIT_EVENT_INTERVAL_TICKS === 0) {
      world.events.push({
        type: "enemy_hit",
        enemyId: enemy.id,
        damage,
        pos: { ...enemy.pos }
      });
    }
  }
}

function triggerTrap(world: WorldState, hazard: HazardState): boolean {
  for (const enemy of world.enemies) {
    if (!enemyInHazard(enemy, hazard)) {
      continue;
    }

    enemy.hp -= hazard.damage;
    creditDamage(world, hazard.ownerId, hazard.damage);
    enemy.slowFactor = hazard.slowFactor;
    enemy.slowTicks = hazard.slowDurationTicks;
    world.events.push({
      type: "enemy_hit",
      enemyId: enemy.id,
      damage: hazard.damage,
      pos: { ...enemy.pos }
    });
    world.events.push({
      type: "trap_triggered",
      x: hazard.pos.x,
      y: hazard.pos.y
    });
    return true;
  }

  return false;
}

function enemyInHazard(enemy: EnemyState, hazard: HazardState): boolean {
  if (enemy.hp <= 0) {
    return false;
  }

  const dx = hazard.pos.x - enemy.pos.x;
  const dy = hazard.pos.y - enemy.pos.y;
  const radius = hazard.radius + enemy.radius;
  return dx * dx + dy * dy <= radius * radius;
}

function creditDamage(world: WorldState, ownerId: string, damage: number): void {
  const owner = world.players.find((player: PlayerState) => player.id === ownerId);
  if (owner !== undefined) {
    owner.stats.damageDealt += damage;
  }
}
