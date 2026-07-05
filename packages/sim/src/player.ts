import {
  BASE_PICKUP_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  RAFT_HEIGHT,
  RAFT_WIDTH
} from "./constants";
import type { PlayerId, PlayerState, Vec2, WorldState } from "./types";

export const DEFAULT_PLAYER_POS: Vec2 = { x: 1.5, y: 1.5 };

export function addPlayer(
  world: WorldState,
  id: PlayerId,
  startingWeaponIds: string[] = []
): PlayerState {
  if (world.players.some((player) => player.id === id)) {
    throw new Error(`Player id already exists: ${id}`);
  }

  const player: PlayerState = {
    id,
    pos: clampToRaft(DEFAULT_PLAYER_POS),
    facing: { x: 0, y: 1 },
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    moveSpeed: PLAYER_MOVE_SPEED,
    repairSpeed: 1.0,
    coins: 0,
    damageMult: 1,
    attackSpeedMult: 1,
    pickupRadius: BASE_PICKUP_RADIUS,
    items: [],
    shop: {
      offers: [],
      locked: [],
      rerollCost: 0
    },
    weapons: startingWeaponIds.map((defId) => ({ defId, cooldownTicks: 0 })),
    dashCooldown: 0,
    dashTicks: 0,
    dashDir: { x: 0, y: 1 },
    prevDash: false
  };

  world.players.push(player);
  return player;
}

export function clampToRaft(pos: Vec2): Vec2 {
  return {
    x: clamp(pos.x, PLAYER_RADIUS, RAFT_WIDTH - PLAYER_RADIUS),
    y: clamp(pos.y, PLAYER_RADIUS, RAFT_HEIGHT - PLAYER_RADIUS)
  };
}

export function clampMovement(movement: Vec2): Vec2 {
  const magnitude = vectorMagnitude(movement);
  if (magnitude <= 1) {
    return { x: movement.x, y: movement.y };
  }

  return {
    x: movement.x / magnitude,
    y: movement.y / magnitude
  };
}

export function normalizeOrZero(vector: Vec2): Vec2 {
  const magnitude = vectorMagnitude(vector);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude
  };
}

function vectorMagnitude(vector: Vec2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
