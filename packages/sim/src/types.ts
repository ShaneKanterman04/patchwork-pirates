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

export type WeaponPattern = { kind: "melee_arc"; arcDegrees: number };

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
  | { type: "enemy_killed"; enemyId: string; pos: Vec2 };

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
  nextEntityId: number;
  spawnTimer: number;
}
