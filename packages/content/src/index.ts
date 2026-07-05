import type { ContentRegistry, EnemyDef, WeaponDef, WorldState } from "@patchwork/sim";

export type ContentWorldState = WorldState;

export const CUTLASS = {
  id: "cutlass",
  name: "Cutlass",
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 18,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
} as const satisfies WeaponDef;

export const HARPOON_GUN = {
  id: "harpoon_gun",
  name: "Harpoon Gun",
  targeting: "attacking_raft",
  cooldownS: 1.1,
  rangeTiles: 4.5,
  damage: 22,
  pattern: {
    kind: "projectile",
    projectileSpeed: 14,
    homing: true,
    effect: "pull_or_slow",
    pullDistance: 2.5,
    slowFactor: 0.5,
    slowDurationS: 1.5
  }
} as const satisfies WeaponDef;

export const COCONUT_LAUNCHER = {
  id: "coconut_launcher",
  name: "Coconut Launcher",
  targeting: "densest_cluster",
  cooldownS: 1.6,
  rangeTiles: 5,
  damage: 26,
  pattern: { kind: "lob", projectileSpeed: 7, aoeRadius: 1.3 }
} as const satisfies WeaponDef;

export const CHUM = {
  id: "chum",
  name: "Chum",
  maxHp: 18,
  speedTilesPerSec: 2.6,
  contactDamage: 6,
  contactCooldownS: 0.6,
  radius: 0.3,
  coinValue: 1,
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
    tileDamage: 14
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
  heavy: false,
  basePriority: 10,
  elite: false,
  behavior: {
    kind: "tile_eater",
    attackCooldownS: 1.0,
    tileDamage: 18
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
  heavy: true,
  basePriority: 15,
  elite: true,
  behavior: {
    kind: "tank_smasher",
    attackCooldownS: 1.2,
    tileDamage: 30,
    knockbackRadius: 1.2,
    knockbackStrength: 3
  }
} as const satisfies EnemyDef;

export const WEAPONS = {
  cutlass: CUTLASS,
  harpoon_gun: HARPOON_GUN,
  coconut_launcher: COCONUT_LAUNCHER
} as const satisfies Record<string, WeaponDef>;

export const ENEMIES = {
  chum: CHUM,
  spitter_crab: SPITTER_CRAB,
  plank_biter: PLANK_BITER,
  brute_turtle: BRUTE_TURTLE
} as const satisfies Record<string, EnemyDef>;

export const CONTENT = {
  weapons: WEAPONS,
  enemies: ENEMIES
} as const satisfies ContentRegistry;
