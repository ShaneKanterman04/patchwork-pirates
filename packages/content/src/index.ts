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

export const CHUM = {
  id: "chum",
  name: "Chum",
  maxHp: 18,
  speedTilesPerSec: 2.6,
  contactDamage: 6,
  contactCooldownS: 0.6,
  radius: 0.3,
  coinValue: 1
} as const satisfies EnemyDef;

export const WEAPONS = {
  cutlass: CUTLASS
} as const satisfies Record<string, WeaponDef>;

export const ENEMIES = {
  chum: CHUM
} as const satisfies Record<string, EnemyDef>;

export const CONTENT = {
  weapons: WEAPONS,
  enemies: ENEMIES
} as const satisfies ContentRegistry;
