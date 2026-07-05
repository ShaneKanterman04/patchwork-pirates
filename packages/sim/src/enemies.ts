import {
  PLAYER_RADIUS,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TICK_RATE
} from "./constants";
import { isHole, isWalkable, tileAt, damageTile } from "./raft";
import type {
  EnemyBehavior,
  EnemyDef,
  EnemyState,
  PlayerState,
  RaftTile,
  Vec2,
  WorldState
} from "./types";

export function updateEnemies(world: WorldState): void {
  for (const enemy of world.enemies) {
    enemy.attackingTileId = null;
    const def = world.content.enemies[enemy.type];

    if (def !== undefined) {
      updateEnemyByBehavior(world, enemy, def.behavior);
    }

    enemy.contactCooldownTicks = Math.max(0, enemy.contactCooldownTicks - 1);
    enemy.slowTicks = Math.max(0, enemy.slowTicks - 1);
    if (enemy.slowTicks === 0) {
      enemy.slowFactor = 1;
    }
  }
}

function updateEnemyByBehavior(
  world: WorldState,
  enemy: EnemyState,
  behavior: EnemyBehavior
): void {
  switch (behavior.kind) {
    case "swarmer_melee":
      updateSwarmerMelee(world, enemy);
      return;
    case "ranged_lobber":
      updateRangedLobber(world, enemy, behavior);
      return;
    case "tile_eater":
      updateTileEater(world, enemy, behavior);
      return;
    case "tank_smasher":
      updateTankSmasher(world, enemy, behavior);
      return;
  }
}

function updateSwarmerMelee(world: WorldState, enemy: EnemyState): void {
  const target = nearestPlayer(world.players, enemy.pos);

  if (target === null) {
    return;
  }

  moveToward(enemy, target.pos);

  if (
    distance(enemy.pos, target.pos) <= enemy.radius + PLAYER_RADIUS &&
    enemy.contactCooldownTicks === 0
  ) {
    target.hp = Math.max(0, target.hp - enemy.contactDamage);
    enemy.contactCooldownTicks = enemy.contactCooldownMax;
  }
}

function updateRangedLobber(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "ranged_lobber" }>
): void {
  const target = nearestPlayer(world.players, enemy.pos);

  if (target === null) {
    return;
  }

  const distanceToTarget = distance(enemy.pos, target.pos);
  if (distanceToTarget > behavior.attackRangeTiles) {
    moveToward(enemy, target.pos);
  }

  if (
    distanceToTarget > behavior.attackRangeTiles ||
    enemy.contactCooldownTicks > 0
  ) {
    return;
  }

  const targetTile = nearestIntactRaftTile(world, target.pos);
  const targetTileThisAttack =
    targetTile !== null &&
    enemy.contactCooldownMax > 0 &&
    Math.floor(world.tick / enemy.contactCooldownMax) % 2 === 1;
  const landPos = targetTileThisAttack
    ? tileCenter(targetTile)
    : { ...target.pos };

  if (targetTileThisAttack && targetTile !== null) {
    enemy.attackingTileId = tileId(targetTile);
  }

  spawnEnemyLob(world, enemy, landPos, behavior);
  enemy.contactCooldownTicks = enemy.contactCooldownMax;
}

function updateTileEater(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "tile_eater" }>
): void {
  const targetTile = nearestIntactRaftTile(world, enemy.pos);

  if (targetTile === null) {
    return;
  }

  const targetPos = tileCenter(targetTile);
  if (distance(enemy.pos, targetPos) > enemy.radius + 0.6) {
    moveToward(enemy, targetPos);
    return;
  }

  enemy.attackingTileId = tileId(targetTile);
  if (enemy.contactCooldownTicks === 0) {
    damageTile(world, targetTile.col, targetTile.row, behavior.tileDamage);
    enemy.contactCooldownTicks = enemy.contactCooldownMax;
  }
}

function updateTankSmasher(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "tank_smasher" }>
): void {
  applyKnockbackAura(world, enemy, behavior);

  const target = nearestPlayer(world.players, enemy.pos);
  if (target === null) {
    return;
  }

  moveToward(enemy, target.pos);

  if (
    distance(enemy.pos, target.pos) <= enemy.radius + PLAYER_RADIUS &&
    enemy.contactCooldownTicks === 0
  ) {
    target.hp = Math.max(0, target.hp - enemy.contactDamage);
    const tile = tileAt(world.raft, Math.floor(enemy.pos.x), Math.floor(enemy.pos.y));
    if (tile !== undefined) {
      damageTile(world, tile.col, tile.row, behavior.tileDamage);
      enemy.attackingTileId = tileId(tile);
    }
    enemy.contactCooldownTicks = enemy.contactCooldownMax;
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
    const salvageValue = def?.salvageValue ?? 0;

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
    if (salvageValue > 0) {
      world.pickups.push({
        id: nextEntityId(world),
        kind: "salvage",
        pos: { ...enemy.pos },
        value: salvageValue
      });
    }
  }

  world.enemies = survivors;
}

export function createEnemy(
  world: WorldState,
  def: EnemyDef,
  pos: Vec2
): EnemyState {
  // A single per-enemy timer backs contact attacks and behavior-specific
  // attacks; behavior cooldowns replace contact cooldowns for non-melee AI.
  const cooldownS = behaviorCooldownS(def);

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
    contactCooldownMax: Math.round(cooldownS * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null
  };
}

function behaviorCooldownS(def: EnemyDef): number {
  if (def.behavior.kind === "swarmer_melee") {
    return def.contactCooldownS;
  }

  return def.behavior.attackCooldownS;
}

function moveToward(enemy: EnemyState, target: Vec2): void {
  const movementDir = normalize({
    x: target.x - enemy.pos.x,
    y: target.y - enemy.pos.y
  });
  const speed = enemy.speed * (enemy.slowTicks > 0 ? enemy.slowFactor : 1);
  const step = speed / TICK_RATE;

  enemy.pos = {
    x: enemy.pos.x + movementDir.x * step,
    y: enemy.pos.y + movementDir.y * step
  };
}

function spawnEnemyLob(
  world: WorldState,
  enemy: EnemyState,
  landPos: Vec2,
  behavior: Extract<EnemyBehavior, { kind: "ranged_lobber" }>
): void {
  const direction = normalize({
    x: landPos.x - enemy.pos.x,
    y: landPos.y - enemy.pos.y
  });

  world.projectiles.push({
    id: nextEntityId(world),
    type: "enemy_glob",
    faction: "enemy",
    pos: { ...enemy.pos },
    vel: {
      x: direction.x * behavior.projectileSpeed,
      y: direction.y * behavior.projectileSpeed
    },
    damage: behavior.playerDamage,
    tileDamage: behavior.tileDamage,
    ttl: projectileTtl(distance(enemy.pos, landPos), behavior.projectileSpeed),
    ownerId: enemy.id,
    homing: false,
    targetId: null,
    landPos,
    aoeRadius: behavior.aoeRadius,
    effect: null,
    pullDistance: 0,
    slowFactor: 1,
    slowDurationTicks: 0
  });
}

function nearestIntactRaftTile(world: WorldState, pos: Vec2): RaftTile | null {
  let selectedDeck: RaftTile | null = null;
  let selectedDeckDistance = Infinity;
  let core: RaftTile | null = null;
  let coreDistance = Infinity;

  for (const tile of world.raft.tiles) {
    const targetPos = tileCenter(tile);
    const distanceToTile = distance(pos, targetPos);

    if (tile.kind === "core") {
      if (tile.hp > 0 && distanceToTile < coreDistance) {
        core = tile;
        coreDistance = distanceToTile;
      }
      continue;
    }

    if (tile.broken) {
      continue;
    }

    if (distanceToTile < selectedDeckDistance) {
      selectedDeck = tile;
      selectedDeckDistance = distanceToTile;
    }
  }

  if (selectedDeck !== null) {
    return selectedDeck;
  }

  return core;
}

function applyKnockbackAura(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "tank_smasher" }>
): void {
  const step = behavior.knockbackStrength / TICK_RATE;

  for (const player of world.players) {
    if (player.out) {
      continue;
    }

    const offset = {
      x: player.pos.x - enemy.pos.x,
      y: player.pos.y - enemy.pos.y
    };
    const distanceToPlayer = magnitude(offset);

    if (
      distanceToPlayer === 0 ||
      distanceToPlayer > behavior.knockbackRadius + PLAYER_RADIUS
    ) {
      continue;
    }

    const dir = {
      x: offset.x / distanceToPlayer,
      y: offset.y / distanceToPlayer
    };
    player.pos = movePlayerOnRaft(world, player.pos, {
      x: player.pos.x + dir.x * step,
      y: player.pos.y + dir.y * step
    });
  }
}

function movePlayerOnRaft(
  world: WorldState,
  currentPos: Vec2,
  nextPos: Vec2
): Vec2 {
  const clamped = clampToRaft(nextPos);
  const currentCol = Math.floor(currentPos.x);
  const currentRow = Math.floor(currentPos.y);

  const candidateX = { x: clamped.x, y: currentPos.y };
  const candidateXCol = Math.floor(candidateX.x);
  const candidateXRow = Math.floor(candidateX.y);
  const x =
    isHole(world.raft, candidateXCol, candidateXRow) &&
    (candidateXCol !== currentCol || candidateXRow !== currentRow)
      ? currentPos.x
      : candidateX.x;

  const candidateY = { x, y: clamped.y };
  const candidateYCol = Math.floor(candidateY.x);
  const candidateYRow = Math.floor(candidateY.y);
  const y =
    isHole(world.raft, candidateYCol, candidateYRow) &&
    (candidateYCol !== currentCol || candidateYRow !== currentRow)
      ? currentPos.y
      : candidateY.y;

  const candidate = { x, y };
  return isWalkable(world.raft, candidate.x, candidate.y) ? candidate : currentPos;
}

function clampToRaft(pos: Vec2): Vec2 {
  return {
    x: clamp(pos.x, PLAYER_RADIUS, RAFT_WIDTH - PLAYER_RADIUS),
    y: clamp(pos.y, PLAYER_RADIUS, RAFT_HEIGHT - PLAYER_RADIUS)
  };
}

function tileCenter(tile: RaftTile): Vec2 {
  return { x: tile.col + 0.5, y: tile.row + 0.5 };
}

function tileId(tile: RaftTile): string {
  return `${tile.col},${tile.row}`;
}

function projectileTtl(distanceTiles: number, speedTilesPerSec: number): number {
  return Math.ceil(distanceTiles / (speedTilesPerSec / TICK_RATE)) + 3;
}

function nextEntityId(world: WorldState): string {
  const id = `e${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}

function nearestPlayer(players: PlayerState[], pos: Vec2): PlayerState | null {
  let selected: PlayerState | null = null;
  let selectedDistance = Infinity;

  for (const player of players) {
    if (player.out) {
      continue;
    }

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

function magnitude(vector: Vec2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
