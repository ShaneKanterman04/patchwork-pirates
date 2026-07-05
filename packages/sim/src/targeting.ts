import type { EnemyState, PlayerState, WeaponDef, WorldState } from "./types";

export function selectTarget(
  world: WorldState,
  wielder: PlayerState,
  def: WeaponDef
): EnemyState | null {
  if (def.targeting !== "nearest") {
    throw new Error(`targeting mode not implemented: ${def.targeting}`);
  }

  let selected: EnemyState | null = null;
  let selectedDistance = Infinity;

  for (const enemy of world.enemies) {
    const distanceToEnemy = distance(wielder.pos, enemy.pos);

    if (distanceToEnemy > def.rangeTiles + enemy.radius) {
      continue;
    }

    if (distanceToEnemy < selectedDistance) {
      selected = enemy;
      selectedDistance = distanceToEnemy;
    }
  }

  return selected;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
