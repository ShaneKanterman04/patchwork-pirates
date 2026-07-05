import {
  AURA_ATTACK_SPEED_BONUS,
  AURA_RADIUS,
  MARK_DURATION_S,
  MARK_INTERVAL_S,
  MARK_RADIUS,
  TICK_RATE
} from "./constants";
import { threatScore } from "./targeting";
import type { EnemyState, PlayerState, WorldState } from "./types";

export function applyAuras(world: WorldState): void {
  for (const player of world.players) {
    player.auraAttackSpeedMult = 1;
  }

  for (const source of world.players) {
    if (
      source.passive !== "attack_speed_aura" ||
      !isActivePlayer(source)
    ) {
      continue;
    }

    for (const target of world.players) {
      if (target === source || !isActivePlayer(target)) {
        continue;
      }

      if (distance(source.pos, target.pos) > AURA_RADIUS) {
        continue;
      }

      target.auraAttackSpeedMult = Math.max(
        target.auraAttackSpeedMult,
        1 + AURA_ATTACK_SPEED_BONUS
      );
    }
  }
}

export function updateSpecials(world: WorldState): void {
  for (const player of world.players) {
    if (player.specialCooldownTicks > 0) {
      player.specialCooldownTicks -= 1;
    }

    if (
      player.special !== "mark_dangerous" ||
      !isActivePlayer(player) ||
      player.specialCooldownTicks > 0
    ) {
      continue;
    }

    const target = selectMostDangerousEnemy(world, player);
    if (target === null) {
      continue;
    }

    target.markTicks = Math.round(MARK_DURATION_S * TICK_RATE);
    player.specialCooldownTicks = Math.round(MARK_INTERVAL_S * TICK_RATE);
  }

  for (const enemy of world.enemies) {
    enemy.markTicks = Math.max(0, enemy.markTicks - 1);
  }
}

function selectMostDangerousEnemy(
  world: WorldState,
  player: PlayerState
): EnemyState | null {
  let selected: EnemyState | null = null;
  let selectedScore = -Infinity;

  for (const enemy of world.enemies) {
    if (enemy.hp <= 0 || distance(player.pos, enemy.pos) > MARK_RADIUS + enemy.radius) {
      continue;
    }

    const score = threatScore(world, player, enemy);
    if (score > selectedScore) {
      selected = enemy;
      selectedScore = score;
    }
  }

  return selected;
}

function isActivePlayer(player: PlayerState): boolean {
  return !player.downed && !player.out && player.hp > 0;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
