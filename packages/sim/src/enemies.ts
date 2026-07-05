import {
  MAX_ENEMIES,
  PLAYER_RADIUS,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  SPAWN_INTERVAL_TICKS,
  TICK_RATE
} from "./constants";
import { nextRandom } from "./world";
import type { EnemyDef, EnemyState, PlayerState, Vec2, WorldState } from "./types";

export function spawnEnemies(world: WorldState): void {
  world.spawnTimer = Math.max(0, world.spawnTimer - 1);

  if (world.spawnTimer > 0) {
    return;
  }

  world.spawnTimer = SPAWN_INTERVAL_TICKS;

  const enemyDefs = Object.values(world.content.enemies);

  if (enemyDefs.length === 0 || world.enemies.length >= MAX_ENEMIES) {
    return;
  }

  const def = enemyDefs[0];

  if (def === undefined) {
    return;
  }

  const edge = Math.floor(nextRandom(world) * 4);
  const offset = nextRandom(world);
  const pos = spawnPosition(edge, offset);

  world.enemies.push(createEnemy(world, def, pos));
}

export function updateEnemies(world: WorldState): void {
  for (const enemy of world.enemies) {
    const target = nearestPlayer(world.players, enemy.pos);

    if (target !== null) {
      const movementDir = normalize({
        x: target.pos.x - enemy.pos.x,
        y: target.pos.y - enemy.pos.y
      });
      const speed =
        enemy.speed * (enemy.slowTicks > 0 ? enemy.slowFactor : 1);
      const step = speed / TICK_RATE;

      enemy.pos = {
        x: enemy.pos.x + movementDir.x * step,
        y: enemy.pos.y + movementDir.y * step
      };

      const distanceToTarget = distance(enemy.pos, target.pos);

      if (
        distanceToTarget <= enemy.radius + PLAYER_RADIUS &&
        enemy.contactCooldownTicks === 0
      ) {
        target.hp = Math.max(0, target.hp - enemy.contactDamage);
        enemy.contactCooldownTicks = enemy.contactCooldownMax;
      }
    }

    enemy.contactCooldownTicks = Math.max(0, enemy.contactCooldownTicks - 1);
    enemy.slowTicks = Math.max(0, enemy.slowTicks - 1);
    if (enemy.slowTicks === 0) {
      enemy.slowFactor = 1;
    }
  }
}

export function resolveEnemyDeaths(world: WorldState): void {
  const survivors: EnemyState[] = [];

  for (const enemy of world.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
      continue;
    }

    const def = world.content.enemies[enemy.type];
    const value = def?.coinValue ?? 0;

    world.events.push({
      type: "enemy_killed",
      enemyId: enemy.id,
      pos: { ...enemy.pos }
    });
    world.pickups.push({
      id: nextEntityId(world),
      kind: "coin",
      pos: { ...enemy.pos },
      value
    });
  }

  world.enemies = survivors;
}

function createEnemy(world: WorldState, def: EnemyDef, pos: Vec2): EnemyState {
  return {
    id: nextEntityId(world),
    type: def.id,
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: def.radius,
    speed: def.speedTilesPerSec,
    contactDamage: def.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(def.contactCooldownS * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null
  };
}

function nextEntityId(world: WorldState): string {
  const id = `e${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}

function spawnPosition(edge: number, offset: number): Vec2 {
  if (edge === 0) {
    return { x: offset * RAFT_WIDTH, y: -1 };
  }

  if (edge === 1) {
    return { x: RAFT_WIDTH + 1, y: offset * RAFT_HEIGHT };
  }

  if (edge === 2) {
    return { x: offset * RAFT_WIDTH, y: RAFT_HEIGHT + 1 };
  }

  return { x: -1, y: offset * RAFT_HEIGHT };
}

function nearestPlayer(players: PlayerState[], pos: Vec2): PlayerState | null {
  let selected: PlayerState | null = null;
  let selectedDistance = Infinity;

  for (const player of players) {
    const distanceToPlayer = distance(pos, player.pos);

    if (distanceToPlayer < selectedDistance) {
      selected = player;
      selectedDistance = distanceToPlayer;
    }
  }

  return selected;
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
