import {
  BASE_PICKUP_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS
} from "./constants";
import type {
  CharacterDef,
  PlayerId,
  PlayerState,
  RaftState,
  Vec2,
  WorldState
} from "./types";

export const DEFAULT_PLAYER_POS: Vec2 = { x: 1.5, y: 1.5 };

export function addPlayer(
  world: WorldState,
  id: PlayerId,
  startingWeaponIds: string[] = [],
  characterId?: string
): PlayerState {
  if (world.players.some((player) => player.id === id)) {
    throw new Error(`Player id already exists: ${id}`);
  }

  const character =
    characterId === undefined ? undefined : world.content.characters[characterId];
  const characterWeapons =
    character === undefined ? [] : [character.startingWeaponId];

  const player: PlayerState = {
    id,
    characterId: null,
    passive: "none",
    special: "none",
    specialCooldownTicks: 0,
    auraAttackSpeedMult: 1,
    pos: clampToRaft(DEFAULT_PLAYER_POS),
    facing: { x: 0, y: 1 },
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    downed: false,
    out: false,
    bleedOutTicks: 0,
    reviveProgressTicks: 0,
    prevHp: PLAYER_MAX_HP,
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
    weapons: [...characterWeapons, ...startingWeaponIds].map((defId) => ({
      defId,
      cooldownTicks: 0
    })),
    stats: {
      damageDealt: 0,
      tilesRepaired: 0,
      revives: 0
    },
    dashCooldown: 0,
    dashTicks: 0,
    dashDir: { x: 0, y: 1 },
    prevDash: false
  };

  if (character !== undefined) {
    applyCharacterProfile(player, character);
  }

  world.players.push(player);
  return player;
}

export function applyCharacterProfile(
  player: PlayerState,
  character: CharacterDef
): void {
  player.characterId = character.id;
  player.passive = character.passive;
  player.special = character.special;
  player.specialCooldownTicks = 0;
  player.auraAttackSpeedMult = 1;
  player.weapons = [{ defId: character.startingWeaponId, cooldownTicks: 0 }];

  resetBaseStats(player);
  const statProfile = character.statProfile;
  const maxHpDelta = statProfile.maxHp ?? 0;
  player.maxHp += maxHpDelta;
  player.hp = player.maxHp;
  player.prevHp = player.maxHp;
  player.moveSpeed += statProfile.moveSpeed ?? 0;
  player.pickupRadius += statProfile.pickupRadius ?? 0;
  player.repairSpeed += statProfile.repairSpeed ?? 0;
  player.damageMult += statProfile.damageMult ?? 0;
  player.attackSpeedMult += statProfile.attackSpeedMult ?? 0;
}

function resetBaseStats(player: PlayerState): void {
  player.maxHp = PLAYER_MAX_HP;
  player.hp = PLAYER_MAX_HP;
  player.prevHp = PLAYER_MAX_HP;
  player.moveSpeed = PLAYER_MOVE_SPEED;
  player.repairSpeed = 1.0;
  player.damageMult = 1;
  player.attackSpeedMult = 1;
  player.pickupRadius = BASE_PICKUP_RADIUS;
}

export function clampToRaft(pos: Vec2, raft?: RaftState): Vec2 {
  const minX = raft?.minCol ?? 0;
  const minY = raft?.minRow ?? 0;
  const maxX = raft === undefined ? 5 : raft.maxCol + 1;
  const maxY = raft === undefined ? 5 : raft.maxRow + 1;

  return {
    x: clamp(pos.x, minX + PLAYER_RADIUS, maxX - PLAYER_RADIUS),
    y: clamp(pos.y, minY + PLAYER_RADIUS, maxY - PLAYER_RADIUS)
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
