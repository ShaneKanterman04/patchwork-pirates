import type {
  ContentRegistry,
  CharacterDef,
  EnemyDef,
  ItemDef,
  ModuleDef,
  WaveDef,
  WeaponDef,
  WorldState
} from "@patchwork/sim";
import { KRAKEN_HP, SUPPLY_CACHE_CAPACITY } from "@patchwork/sim";

export type ContentWorldState = WorldState;
type DescribedWeaponDef = WeaponDef & { description: string };
type DescribedModuleDef = ModuleDef & { description: string };

export const TILE_BUILD_SALVAGE_COST = 5;

export const CUTLASS = {
  id: "cutlass",
  name: "Cutlass",
  description: "Melee slash: hits foes in a wide arc in front of you",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 18,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
} as const satisfies DescribedWeaponDef;

export const HARPOON_GUN = {
  id: "harpoon_gun",
  name: "Harpoon Gun",
  description: "Homing shot: pulls small foes, slows big ones",
  shopPrice: 16,
  targeting: "attacking_raft",
  cooldownS: 1.1,
  rangeTiles: 4.5,
  damage: 22,
  tags: ["harpoon", "defensive"],
  pattern: {
    kind: "projectile",
    projectileSpeed: 14,
    homing: true,
    effect: "pull_or_slow",
    pullDistance: 2.5,
    slowFactor: 0.5,
    slowDurationS: 1.5
  }
} as const satisfies DescribedWeaponDef;

export const COCONUT_LAUNCHER = {
  id: "coconut_launcher",
  name: "Coconut Launcher",
  description: "Lobbed splash: great against tight clusters",
  shopPrice: 20,
  targeting: "densest_cluster",
  cooldownS: 1.6,
  rangeTiles: 5,
  damage: 26,
  pattern: { kind: "lob", projectileSpeed: 7, aoeRadius: 1.3 }
} as const satisfies DescribedWeaponDef;

export const CHUM = {
  id: "chum",
  name: "Chum",
  maxHp: 18,
  speedTilesPerSec: 2.6,
  contactDamage: 6,
  contactCooldownS: 0.75,
  radius: 0.3,
  coinValue: 1,
  salvageValue: 0,
  heavy: false,
  basePriority: 0,
  elite: false,
  behavior: { kind: "swarmer_melee" }
} as const satisfies EnemyDef;

export const SPITTER_CRAB = {
  id: "spitter_crab",
  name: "Spitter Crab",
  maxHp: 30,
  speedTilesPerSec: 1.6,
  contactDamage: 0,
  contactCooldownS: 2.2,
  radius: 0.35,
  coinValue: 2,
  salvageValue: 2,
  heavy: false,
  basePriority: 5,
  elite: false,
  behavior: {
    kind: "ranged_lobber",
    attackRangeTiles: 4.5,
    attackCooldownS: 2.2,
    projectileSpeed: 6,
    aoeRadius: 0.9,
    playerDamage: 8,
    tileDamage: 2
  }
} as const satisfies EnemyDef;

export const PLANK_BITER = {
  id: "plank_biter",
  name: "Plank-Biter",
  maxHp: 40,
  speedTilesPerSec: 2.0,
  contactDamage: 0,
  contactCooldownS: 1.0,
  radius: 0.35,
  coinValue: 2,
  salvageValue: 2,
  heavy: false,
  basePriority: 10,
  elite: false,
  behavior: {
    kind: "tile_eater",
    attackCooldownS: 1.0,
    tileDamage: 2
  }
} as const satisfies EnemyDef;

export const BRUTE_TURTLE = {
  id: "brute_turtle",
  name: "Brute Turtle",
  maxHp: 220,
  speedTilesPerSec: 1.2,
  contactDamage: 18,
  contactCooldownS: 1.2,
  radius: 0.6,
  coinValue: 6,
  salvageValue: 5,
  heavy: true,
  basePriority: 15,
  elite: true,
  behavior: {
    kind: "tank_smasher",
    attackCooldownS: 1.2,
    tileDamage: 2,
    knockbackRadius: 1.2,
    knockbackStrength: 3
  }
} as const satisfies EnemyDef;

export const KRAKEN_TENTACLE = {
  id: "kraken_tentacle",
  name: "Kraken Tentacle",
  maxHp: 70,
  speedTilesPerSec: 0,
  contactDamage: 0,
  contactCooldownS: 2.2,
  radius: 0.45,
  coinValue: 3,
  salvageValue: 3,
  heavy: true,
  basePriority: 30,
  elite: false,
  behavior: {
    kind: "tentacle",
    attackCooldownS: 2.2,
    telegraphS: 0.85,
    tileDamage: 2
  }
} as const satisfies EnemyDef;

export const KRAKEN_HEAD = {
  id: "kraken_head",
  name: "Kraken Head",
  maxHp: KRAKEN_HP,
  speedTilesPerSec: 0,
  contactDamage: 0,
  contactCooldownS: 1.5,
  radius: 0.8,
  coinValue: 0,
  salvageValue: 0,
  heavy: true,
  basePriority: 100,
  elite: true,
  behavior: {
    kind: "kraken_head",
    attackCooldownS: 1.5,
    playerDamage: 16,
    tileDamage: 2
  }
} as const satisfies EnemyDef;

export const CANNON = {
  id: "cannon",
  name: "Cannon",
  description: "Auto-fires at the nearest enemy in range",
  maxHp: 60,
  salvageCost: 12,
  behavior: {
    kind: "cannon",
    cooldownS: 1.0,
    rangeTiles: 4,
    damage: 14,
    projectileSpeed: 9
  }
} as const satisfies DescribedModuleDef;

export const REPAIR_STATION = {
  id: "repair_station",
  name: "Supply Cache",
  description: "Increases crew Supplies capacity for repairs and building",
  maxHp: 60,
  salvageCost: 10,
  behavior: {
    kind: "supply_cache",
    capacityBonus: SUPPLY_CACHE_CAPACITY
  }
} as const satisfies DescribedModuleDef;

export const WEAPONS = {
  cutlass: CUTLASS,
  harpoon_gun: HARPOON_GUN,
  coconut_launcher: COCONUT_LAUNCHER
} as const satisfies Record<string, DescribedWeaponDef>;

export const CAPTAIN = {
  id: "captain",
  name: "Captain",
  startingWeaponId: "cutlass",
  statProfile: {},
  passive: "attack_speed_aura",
  special: "mark_dangerous"
} as const satisfies CharacterDef;

export const FISHER = {
  id: "fisher",
  name: "Fisher",
  startingWeaponId: "harpoon_gun",
  statProfile: { pickupRadius: 0.6 },
  passive: "none",
  special: "harpoon_raft_priority"
} as const satisfies CharacterDef;

export const CHARACTERS = {
  captain: CAPTAIN,
  fisher: FISHER
} as const satisfies Record<string, CharacterDef>;

export const PLATED_HULL = {
  id: "plated_hull",
  name: "Plated Hull",
  basePrice: 14,
  modifiers: { maxHp: 20 }
} as const satisfies ItemDef;

export const SHARP_CUTLASS = {
  id: "sharp_cutlass",
  name: "Sharp Cutlass",
  basePrice: 12,
  modifiers: { damageMult: 0.12 }
} as const satisfies ItemDef;

export const POWDER_KEG = {
  id: "powder_keg",
  name: "Powder Keg",
  basePrice: 12,
  modifiers: { attackSpeedMult: 0.12 }
} as const satisfies ItemDef;

export const SWIFT_BOOTS = {
  id: "swift_boots",
  name: "Swift Boots",
  basePrice: 10,
  modifiers: { moveSpeed: 0.5 }
} as const satisfies ItemDef;

export const MAGNET = {
  id: "magnet",
  name: "Magnet",
  basePrice: 10,
  modifiers: { pickupRadius: 0.5 }
} as const satisfies ItemDef;

export const TAR_BUCKET = {
  id: "tar_bucket",
  name: "Tar Bucket",
  basePrice: 10,
  modifiers: { repairSpeed: 0.4 }
} as const satisfies ItemDef;

export const ITEMS = {
  plated_hull: PLATED_HULL,
  sharp_cutlass: SHARP_CUTLASS,
  powder_keg: POWDER_KEG,
  swift_boots: SWIFT_BOOTS,
  magnet: MAGNET,
  tar_bucket: TAR_BUCKET
} as const satisfies Record<string, ItemDef>;

export const ENEMIES = {
  chum: CHUM,
  spitter_crab: SPITTER_CRAB,
  plank_biter: PLANK_BITER,
  brute_turtle: BRUTE_TURTLE,
  kraken_tentacle: KRAKEN_TENTACLE,
  kraken_head: KRAKEN_HEAD
} as const satisfies Record<string, EnemyDef>;

export const MODULES = {
  cannon: CANNON,
  repair_station: REPAIR_STATION
} as const satisfies Record<string, DescribedModuleDef>;

export const WAVES = [
  {
    durationS: 30,
    budget: 10,
    table: [
      { enemyId: "chum", weight: 6, cost: 1 },
      { enemyId: "plank_biter", weight: 1, cost: 2 }
    ]
  },
  {
    durationS: 35,
    budget: 15,
    table: [
      { enemyId: "chum", weight: 6, cost: 1 },
      { enemyId: "plank_biter", weight: 2, cost: 2 },
      { enemyId: "spitter_crab", weight: 1, cost: 3 }
    ]
  },
  {
    durationS: 42,
    budget: 26,
    table: [
      { enemyId: "chum", weight: 6, cost: 1 },
      { enemyId: "plank_biter", weight: 2, cost: 2 },
      { enemyId: "spitter_crab", weight: 2, cost: 3 }
    ]
  },
  {
    durationS: 48,
    budget: 34,
    table: [
      { enemyId: "chum", weight: 6, cost: 1 },
      { enemyId: "plank_biter", weight: 2, cost: 2 },
      { enemyId: "spitter_crab", weight: 2, cost: 3 },
      { enemyId: "brute_turtle", weight: 1, cost: 8 }
    ]
  },
  {
    durationS: 54,
    budget: 44,
    table: [
      { enemyId: "chum", weight: 5, cost: 1 },
      { enemyId: "plank_biter", weight: 3, cost: 2 },
      { enemyId: "spitter_crab", weight: 2, cost: 3 },
      { enemyId: "brute_turtle", weight: 1, cost: 8 }
    ]
  },
  {
    durationS: 60,
    budget: 56,
    table: [
      { enemyId: "chum", weight: 5, cost: 1 },
      { enemyId: "plank_biter", weight: 3, cost: 2 },
      { enemyId: "spitter_crab", weight: 3, cost: 3 },
      { enemyId: "brute_turtle", weight: 1, cost: 8 }
    ]
  },
  {
    durationS: 68,
    budget: 70,
    table: [
      { enemyId: "chum", weight: 4, cost: 1 },
      { enemyId: "plank_biter", weight: 3, cost: 2 },
      { enemyId: "spitter_crab", weight: 3, cost: 3 },
      { enemyId: "brute_turtle", weight: 2, cost: 8 }
    ]
  },
  {
    durationS: 75,
    budget: 95,
    boss: "kraken",
    table: [
      { enemyId: "chum", weight: 5, cost: 1 },
      { enemyId: "plank_biter", weight: 4, cost: 2 },
      { enemyId: "spitter_crab", weight: 4, cost: 3 },
      { enemyId: "brute_turtle", weight: 3, cost: 8 }
    ]
  }
] satisfies WaveDef[];

export const CONTENT = {
  weapons: WEAPONS,
  characters: CHARACTERS,
  items: ITEMS,
  enemies: ENEMIES,
  modules: MODULES,
  tileBuildSalvageCost: TILE_BUILD_SALVAGE_COST,
  waves: WAVES
} as const satisfies ContentRegistry;
