export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerId = string;

export interface PlayerInput {
  movement: Vec2;
  dash: boolean;
  interact: boolean;
}

export interface PlayerState {
  id: PlayerId;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  moveSpeed: number;
  repairSpeed: number;
  weapons: WeaponInstance[];
  dashCooldown: number;
  dashTicks: number;
  dashDir: Vec2;
  prevDash: boolean;
}

export type TargetingMode =
  | "nearest"
  | "nearest_to_core"
  | "attacking_raft"
  | "highest_hp"
  | "lowest_hp"
  | "densest_cluster"
  | "random"
  | "boss_or_elite";

export type WeaponPattern =
  | { kind: "melee_arc"; arcDegrees: number }
  | {
      kind: "projectile";
      projectileSpeed: number;
      homing: boolean;
      effect?: "pull_or_slow";
      pullDistance?: number;
      slowFactor?: number;
      slowDurationS?: number;
    }
  | { kind: "lob"; projectileSpeed: number; aoeRadius: number };

export interface WeaponDef {
  id: string;
  name: string;
  targeting: TargetingMode;
  cooldownS: number;
  rangeTiles: number;
  damage: number;
  pattern: WeaponPattern;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  speedTilesPerSec: number;
  contactDamage: number;
  contactCooldownS: number;
  radius: number;
  coinValue: number;
  heavy?: boolean;
  basePriority?: number;
  elite?: boolean;
}

export interface ContentRegistry {
  weapons: Record<string, WeaponDef>;
  enemies: Record<string, EnemyDef>;
}

export interface WeaponInstance {
  defId: string;
  cooldownTicks: number;
}

export interface EnemyState {
  id: string;
  type: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  contactDamage: number;
  contactCooldownTicks: number;
  contactCooldownMax: number;
  slowTicks: number;
  slowFactor: number;
  attackingTileId: string | null;
}

export interface PickupState {
  id: string;
  kind: "coin";
  pos: Vec2;
  value: number;
}

export interface ProjectileState {
  id: string;
  type: string;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  ttl: number;
  ownerId: string;
  homing: boolean;
  targetId: string | null;
  landPos: Vec2 | null;
  aoeRadius: number;
  effect: "pull_or_slow" | null;
  pullDistance: number;
  slowFactor: number;
  slowDurationTicks: number;
}

export type SimEvent =
  | {
      type: "weapon_fired";
      wielderId: PlayerId;
      weaponId: string;
      origin: Vec2;
      dir: Vec2;
      arcDegrees: number;
      range: number;
    }
  | { type: "enemy_hit"; enemyId: string; damage: number; pos: Vec2 }
  | { type: "enemy_killed"; enemyId: string; pos: Vec2 }
  | { type: "explosion"; pos: Vec2; radius: number }
  | { type: "tile_broken"; col: number; row: number }
  | { type: "tile_repaired"; col: number; row: number }
  | { type: "core_destroyed" };

export interface RaftTile {
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  kind: "deck" | "core";
  broken: boolean;
}

export interface RaftState {
  width: number;
  height: number;
  tiles: RaftTile[];
}

export interface WorldState {
  tick: number;
  rngState: number;
  players: PlayerState[];
  raft: RaftState;
  content: ContentRegistry;
  enemies: EnemyState[];
  pickups: PickupState[];
  projectiles: ProjectileState[];
  events: SimEvent[];
  coreDestroyed: boolean;
  nextEntityId: number;
  spawnTimer: number;
}
