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
  characterId: string | null;
  passive: CharacterPassive;
  special: CharacterSpecial;
  specialCooldownTicks: number;
  auraAttackSpeedMult: number;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  downed: boolean;
  out: boolean;
  bleedOutTicks: number;
  reviveProgressTicks: number;
  prevHp: number;
  moveSpeed: number;
  repairSpeed: number;
  coins: number;
  damageMult: number;
  attackSpeedMult: number;
  pickupRadius: number;
  items: string[];
  shop: PlayerShop;
  weapons: WeaponInstance[];
  stats: PlayerStats;
  dashCooldown: number;
  dashTicks: number;
  dashDir: Vec2;
  prevDash: boolean;
}

export interface PlayerStats {
  damageDealt: number;
  tilesRepaired: number;
  revives: number;
}

export type ShopOffer =
  | { kind: "weapon"; defId: string; price: number }
  | { kind: "item"; defId: string; price: number }
  | { kind: "sold" };

export interface PlayerShop {
  offers: ShopOffer[];
  locked: boolean[];
  rerollCost: number;
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
  shopPrice: number;
  targeting: TargetingMode;
  cooldownS: number;
  rangeTiles: number;
  damage: number;
  tags?: string[];
  pattern: WeaponPattern;
}

export type CharacterPassive = "none" | "attack_speed_aura";
export type CharacterSpecial =
  | "none"
  | "mark_dangerous"
  | "harpoon_raft_priority";

export interface CharacterDef {
  id: string;
  name: string;
  startingWeaponId: string;
  statProfile: {
    maxHp?: number;
    moveSpeed?: number;
    damageMult?: number;
    attackSpeedMult?: number;
    pickupRadius?: number;
    repairSpeed?: number;
  };
  passive: CharacterPassive;
  special: CharacterSpecial;
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
  salvageValue?: number;
  heavy?: boolean;
  basePriority?: number;
  elite?: boolean;
  behavior: EnemyBehavior;
}

export interface ItemDef {
  id: string;
  name: string;
  basePrice: number;
  modifiers: {
    maxHp?: number;
    damageMult?: number;
    attackSpeedMult?: number;
    moveSpeed?: number;
    pickupRadius?: number;
    repairSpeed?: number;
  };
}

export type ModuleBehavior =
  | {
      kind: "cannon";
      cooldownS: number;
      rangeTiles: number;
      damage: number;
      projectileSpeed: number;
    }
  | {
      kind: "supply_cache";
      capacityBonus: number;
    };

export interface ModuleDef {
  id: string;
  name: string;
  maxHp: number;
  salvageCost: number;
  behavior: ModuleBehavior;
}

export type EnemyBehavior =
  | { kind: "swarmer_melee" }
  | {
      kind: "ranged_lobber";
      attackRangeTiles: number;
      attackCooldownS: number;
      projectileSpeed: number;
      aoeRadius: number;
      playerDamage: number;
      tileDamage: number;
    }
  | { kind: "tile_eater"; attackCooldownS: number; tileDamage: number }
  | {
      kind: "tank_smasher";
      attackCooldownS: number;
      tileDamage: number;
      knockbackRadius: number;
      knockbackStrength: number;
    }
  | {
      kind: "tentacle";
      attackCooldownS: number;
      telegraphS: number;
      tileDamage: number;
    }
  | {
      kind: "kraken_head";
      attackCooldownS: number;
      playerDamage: number;
      tileDamage: number;
    };

export interface ContentRegistry {
  weapons: Record<string, WeaponDef>;
  characters: Record<string, CharacterDef>;
  items: Record<string, ItemDef>;
  enemies: Record<string, EnemyDef>;
  modules: Record<string, ModuleDef>;
  waves: WaveDef[];
}

export interface WaveSpawnEntry {
  enemyId: string;
  weight: number;
  cost: number;
}

export interface WaveDef {
  durationS: number;
  budget: number;
  table: WaveSpawnEntry[];
  boss?: string;
}

export type RunPhase = "lobby" | "combat" | "build" | "victory" | "defeat";

export interface RunState {
  phase: RunPhase;
  wave: number;
  phaseTicksLeft: number;
  budgetRemaining: number;
  spawnTimer: number;
  readyPlayerIds: string[];
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
  telegraphTicks: number;
  markTicks: number;
}

export interface BossState {
  hp: number;
  maxHp: number;
  phase: "tentacles" | "head" | "between";
  phaseTicksLeft: number;
  headEnemyId: string | null;
  cycles: number;
}

export interface PickupState {
  id: string;
  kind: "coin" | "salvage";
  pos: Vec2;
  value: number;
}

export interface PingState {
  id: string;
  kind: "danger" | "repair" | "loot" | "group";
  x: number;
  y: number;
  ttlTicks: number;
  playerId: string;
}

export interface ProjectileState {
  id: string;
  type: string;
  faction: "player" | "enemy";
  pos: Vec2;
  vel: Vec2;
  damage: number;
  tileDamage: number;
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

export interface ModuleState {
  id: string;
  defId: string;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  cooldownTicks: number;
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
  salvage: number;
  enemies: EnemyState[];
  pickups: PickupState[];
  pings: PingState[];
  projectiles: ProjectileState[];
  modules: ModuleState[];
  events: SimEvent[];
  coreDestroyed: boolean;
  nextEntityId: number;
  run: RunState;
  boss: BossState | null;
}
