import {
  CHEF_KILL_RADIUS,
  CHEF_KILLS_PER_FOOD,
  FOOD_HEAL_VALUE,
  PLAYER_RADIUS,
  TICK_RATE
} from "./constants";
import { isHole, isWalkable, tileAt, damageTile } from "./raft";
import { nextRandom } from "./world";
import type {
  EnemyBehavior,
  EnemyDef,
  EnemyState,
  PlayerState,
  RaftTile,
  Vec2,
  WorldState
} from "./types";

const ATTACK_ANIM_TICKS = Math.round(0.3 * TICK_RATE);
const BOARDING_ANIM_TICKS = Math.round(0.35 * TICK_RATE);
const ON_RAFT_SPEED_MULT = 0.6;

export function updateEnemies(world: WorldState): void {
  for (const enemy of world.enemies) {
    enemy.attackAnimTicks = Math.max(0, enemy.attackAnimTicks - 1);
    enemy.boardingAnimTicks = Math.max(0, (enemy.boardingAnimTicks ?? 0) - 1);
    const onRaftNow = isWalkable(world.raft, enemy.pos.x, enemy.pos.y);
    if (onRaftNow && enemy.onRaft !== true) {
      enemy.boardingAnimTicks = BOARDING_ANIM_TICKS;
    }
    enemy.onRaft = onRaftNow;
    if (enemy.telegraphTicks === 0) {
      enemy.attackingTileId = null;
    }
    const def = world.content.enemies[enemy.type];

    if (def !== undefined) {
      updateEnemyByBehavior(world, enemy, def.behavior);
    }

    enemy.contactCooldownTicks = Math.max(0, enemy.contactCooldownTicks - 1);
    enemy.slowTicks = Math.max(0, enemy.slowTicks - 1);
    if (enemy.slowTicks === 0) {
      enemy.slowFactor = 1;
    }
    enemy.buffTicks = Math.max(0, enemy.buffTicks ?? 0);
    if (enemy.buffTicks === 0) {
      enemy.buffFactor = 1;
    } else {
      enemy.buffTicks -= 1;
    }
    enemy.animState = enemyAnimState(enemy);
  }

  world.enemies = world.enemies.filter((enemy) => enemy.escaped !== true);
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
    case "tentacle":
      updateTentacle(world, enemy, behavior);
      return;
    case "kraken_head":
      updateKrakenHead(world, enemy, behavior);
      return;
    case "leap":
      updateLeap(world, enemy, behavior);
      return;
    case "steal":
      updateSteal(world, enemy, behavior);
      return;
    case "explode_on_death":
      updateSwarmerMelee(world, enemy);
      return;
    case "scream_buff":
      updateScreamBuff(world, enemy, behavior);
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
    damagePlayerByContact(enemy, target);
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
  startAttackAnim(enemy);
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
    startAttackAnim(enemy);
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
    damagePlayerByContact(enemy, target);
    const tile = tileAt(world.raft, Math.floor(enemy.pos.x), Math.floor(enemy.pos.y));
    if (tile !== undefined) {
      damageTile(world, tile.col, tile.row, behavior.tileDamage);
      enemy.attackingTileId = tileId(tile);
    }
  }
}

function updateTentacle(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "tentacle" }>
): void {
  if (enemy.telegraphTicks > 0) {
    const target = tileById(world, enemy.attackingTileId);
    enemy.telegraphTicks -= 1;
    if (enemy.telegraphTicks === 0) {
      if (target !== null) {
        damageTile(world, target.col, target.row, behavior.tileDamage);
      }
      startAttackAnim(enemy);
      enemy.attackingTileId = null;
      enemy.contactCooldownTicks = enemy.contactCooldownMax;
    }
    return;
  }

  if (enemy.contactCooldownTicks > 0) {
    return;
  }

  const targetTile = nearestIntactRaftTile(world, enemy.pos);
  if (targetTile === null) {
    return;
  }

  enemy.attackingTileId = tileId(targetTile);
  enemy.telegraphTicks = Math.max(
    Math.ceil(0.8 * TICK_RATE),
    Math.round(behavior.telegraphS * TICK_RATE)
  );
}

function updateKrakenHead(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "kraken_head" }>
): void {
  if (enemy.contactCooldownTicks > 0) {
    return;
  }

  const target = nearestPlayer(world.players, enemy.pos);
  if (target !== null) {
    target.hp = Math.max(0, target.hp - behavior.playerDamage);
  }

  const targetTile = nearestIntactRaftTile(world, enemy.pos);
  if (targetTile !== null) {
    damageTile(world, targetTile.col, targetTile.row, behavior.tileDamage);
    enemy.attackingTileId = tileId(targetTile);
  }

  enemy.contactCooldownTicks = enemy.contactCooldownMax;
}

function updateLeap(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "leap" }>
): void {
  enemy.leapCooldownTicks = Math.max(0, enemy.leapCooldownTicks ?? 0);
  enemy.leapWindupTicks = Math.max(0, enemy.leapWindupTicks ?? 0);
  enemy.leapRemainingTiles = Math.max(0, enemy.leapRemainingTiles ?? 0);

  if (enemy.leapRemainingTiles > 0) {
    const dir = enemy.leapDir ?? { x: 0, y: 0 };
    const speed = effectiveSpeed(enemy) * behavior.leapSpeedMult;
    const step = Math.min(enemy.leapRemainingTiles, speed / TICK_RATE);
    enemy.pos = clampEnemyToRaft(
      {
        x: enemy.pos.x + dir.x * step,
        y: enemy.pos.y + dir.y * step
      },
      enemy,
      world.raft
    );
    enemy.leapRemainingTiles -= step;
    damagePlayersInContact(world, enemy);

    if (enemy.leapRemainingTiles <= 0) {
      enemy.leapRemainingTiles = 0;
      enemy.leapCooldownTicks = Math.round(behavior.cooldownS * TICK_RATE);
    }
    return;
  }

  if (enemy.leapWindupTicks > 0) {
    enemy.leapWindupTicks -= 1;
    if (enemy.leapWindupTicks === 0) {
      enemy.leapRemainingTiles = behavior.leapTiles;
    }
    return;
  }

  if (enemy.leapCooldownTicks > 0) {
    enemy.leapCooldownTicks -= 1;
  }

  const target = nearestPlayer(world.players, enemy.pos);
  if (target === null) {
    return;
  }

  if (
    enemy.leapCooldownTicks === 0 &&
    distance(enemy.pos, target.pos) <= behavior.leapTiles * 0.9
  ) {
    enemy.leapDir = normalize({
      x: target.pos.x - enemy.pos.x,
      y: target.pos.y - enemy.pos.y
    });
    enemy.leapWindupTicks = Math.round(behavior.windupS * TICK_RATE);
    return;
  }

  moveToward(enemy, target.pos);
  damagePlayersInContact(world, enemy);
}

function updateSteal(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "steal" }>
): void {
  enemy.carriedCoins = enemy.carriedCoins ?? 0;

  const coinTarget = nearestCoinPickup(world, enemy.pos);
  const shouldFlee =
    enemy.carriedCoins >= behavior.maxCarried ||
    (coinTarget === null && enemy.carriedCoins > 0);

  if (shouldFlee) {
    fleeFromRaft(world, enemy, behavior.fleeSpeedMult);
    if (isOutsideRaftBy(enemy.pos, world.raft, 3)) {
      enemy.escaped = true;
    }
    return;
  }

  if (coinTarget !== null) {
    moveToward(enemy, coinTarget.pos);
    if (distance(enemy.pos, coinTarget.pos) < enemy.radius + 0.2) {
      world.pickups = world.pickups.filter((pickup) => pickup.id !== coinTarget.id);
      enemy.carriedCoins += 1;
      startAttackAnim(enemy);
    }
    return;
  }

  updateSwarmerMelee(world, enemy);
}

function updateScreamBuff(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "scream_buff" }>
): void {
  if (enemy.contactCooldownTicks === 0) {
    const radius = behavior.buffRadiusTiles;
    for (const other of world.enemies) {
      if (other.id === enemy.id || other.hp <= 0) {
        continue;
      }

      if (distance(enemy.pos, other.pos) <= radius) {
        other.buffTicks = Math.round(behavior.buffDurationS * TICK_RATE);
        other.buffFactor = behavior.buffSpeedMult;
      }
    }

    startAttackAnim(enemy);
    world.events.push({ type: "enemy_screamed", pos: { ...enemy.pos } });
    enemy.contactCooldownTicks = enemy.contactCooldownMax;
  }

  const target = nearestPlayer(world.players, enemy.pos);
  if (target === null) {
    return;
  }

  const desiredDistance = 4;
  const distanceToTarget = distance(enemy.pos, target.pos);
  if (distanceToTarget < desiredDistance * 0.9) {
    moveAway(enemy, target.pos);
    return;
  }

  if (distanceToTarget > desiredDistance * 1.1) {
    moveToward(enemy, target.pos);
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
    const carriedCoins = enemy.carriedCoins ?? 0;

    if (world.boss?.headEnemyId === enemy.id) {
      world.boss.hp = Math.min(world.boss.hp, enemy.hp);
    }
    world.events.push({
      type: "enemy_killed",
      enemyId: enemy.id,
      pos: { ...enemy.pos }
    });
    updateChefKills(world, enemy);
    if (def?.behavior.kind === "explode_on_death") {
      explodeOnDeath(world, enemy, def.behavior);
    }
    if (carriedCoins === 0) {
      world.pickups.push({
        id: nextEntityId(world),
        kind: "coin",
        pos: { ...enemy.pos },
        value
      });
    }
    for (let i = 0; i < carriedCoins + 1 && carriedCoins > 0; i += 1) {
      const angle = nextRandom(world) * Math.PI * 2;
      const radius = nextRandom(world) * 0.35;
      world.pickups.push({
        id: nextEntityId(world),
        kind: "coin",
        pos: {
          x: enemy.pos.x + Math.cos(angle) * radius,
          y: enemy.pos.y + Math.sin(angle) * radius
        },
        value: 1
      });
    }
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

function updateChefKills(world: WorldState, enemy: EnemyState): void {
  const radiusSquared = CHEF_KILL_RADIUS * CHEF_KILL_RADIUS;

  for (const player of world.players) {
    if (
      player.passive !== "chef" ||
      player.downed ||
      player.out ||
      player.hp <= 0 ||
      distanceSquared(player.pos, enemy.pos) > radiusSquared
    ) {
      continue;
    }

    player.chefKillCounter = (player.chefKillCounter ?? 0) + 1;
    if (player.chefKillCounter < CHEF_KILLS_PER_FOOD) {
      continue;
    }

    player.chefKillCounter = 0;
    world.pickups.push({
      id: nextEntityId(world),
      kind: "food",
      pos: { ...enemy.pos },
      value: FOOD_HEAL_VALUE
    });
  }
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
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
    attackAnimTicks: 0,
    slowTicks: 0,
    slowFactor: 1,
    buffTicks: 0,
    buffFactor: 1,
    onRaft: false,
    boardingAnimTicks: 0,
    attackingTileId: null,
    telegraphTicks: 0,
    markTicks: 0,
    animState: "move",
    leapWindupTicks: 0,
    leapCooldownTicks: 0,
    leapRemainingTiles: 0,
    leapDir: { x: 0, y: 0 },
    carriedCoins: 0,
    escaped: false
  };
}

function startAttackAnim(enemy: EnemyState): void {
  enemy.attackAnimTicks = ATTACK_ANIM_TICKS;
}

function enemyAnimState(enemy: EnemyState): EnemyState["animState"] {
  if (enemy.attackAnimTicks > 0) {
    return "attack";
  }

  if ((enemy.leapWindupTicks ?? 0) > 0) {
    return "windup";
  }

  if (enemy.telegraphTicks > 0) {
    return "windup";
  }

  if ((enemy.boardingAnimTicks ?? 0) > 0) {
    return "climb";
  }

  return "move";
}

function behaviorCooldownS(def: EnemyDef): number {
  switch (def.behavior.kind) {
    case "swarmer_melee":
    case "leap":
    case "steal":
    case "explode_on_death":
      return def.contactCooldownS;
    case "scream_buff":
      return def.behavior.screamCooldownS;
    case "ranged_lobber":
    case "tile_eater":
    case "tank_smasher":
    case "tentacle":
    case "kraken_head":
      return def.behavior.attackCooldownS;
  }
}

function moveToward(enemy: EnemyState, target: Vec2): void {
  const movementDir = normalize({
    x: target.x - enemy.pos.x,
    y: target.y - enemy.pos.y
  });
  const speed = effectiveSpeed(enemy);
  const step = speed / TICK_RATE;

  enemy.pos = {
    x: enemy.pos.x + movementDir.x * step,
    y: enemy.pos.y + movementDir.y * step
  };
}

function moveAway(enemy: EnemyState, target: Vec2): void {
  const movementDir = normalize({
    x: enemy.pos.x - target.x,
    y: enemy.pos.y - target.y
  });
  const step = effectiveSpeed(enemy) / TICK_RATE;

  enemy.pos = {
    x: enemy.pos.x + movementDir.x * step,
    y: enemy.pos.y + movementDir.y * step
  };
}

function effectiveSpeed(enemy: EnemyState): number {
  return (
    enemy.speed *
    (enemy.slowTicks > 0 ? enemy.slowFactor : 1) *
    (enemy.onRaft ? ON_RAFT_SPEED_MULT : 1) *
    ((enemy.buffTicks ?? 0) > 0 ? (enemy.buffFactor ?? 1) : 1)
  );
}

function explodeOnDeath(
  world: WorldState,
  enemy: EnemyState,
  behavior: Extract<EnemyBehavior, { kind: "explode_on_death" }>
): void {
  world.events.push({
    type: "explosion",
    pos: { ...enemy.pos },
    radius: behavior.aoeRadius
  });

  for (const player of world.players) {
    if (player.out || player.downed) {
      continue;
    }

    if (distance(enemy.pos, player.pos) <= behavior.aoeRadius + PLAYER_RADIUS) {
      player.hp = Math.max(0, player.hp - behavior.playerDamage);
    }
  }

  const col = Math.floor(enemy.pos.x);
  const row = Math.floor(enemy.pos.y);
  damageTile(world, col, row, behavior.tileDamage);
  damageTile(world, col + 1, row, behavior.tileDamage);
  damageTile(world, col - 1, row, behavior.tileDamage);
  damageTile(world, col, row + 1, behavior.tileDamage);
  damageTile(world, col, row - 1, behavior.tileDamage);
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

function damagePlayersInContact(world: WorldState, enemy: EnemyState): void {
  for (const player of world.players) {
    if (player.out) {
      continue;
    }

    if (
      distance(enemy.pos, player.pos) <= enemy.radius + PLAYER_RADIUS &&
      enemy.contactCooldownTicks === 0
    ) {
      damagePlayerByContact(enemy, player);
      return;
    }
  }
}

function damagePlayerByContact(enemy: EnemyState, player: PlayerState): void {
  player.hp = Math.max(0, player.hp - enemy.contactDamage);
  startAttackAnim(enemy);
  enemy.contactCooldownTicks = enemy.contactCooldownMax;
}

function nearestCoinPickup(
  world: WorldState,
  pos: Vec2
): WorldState["pickups"][number] | null {
  let selected: WorldState["pickups"][number] | null = null;
  let selectedDistance = Infinity;

  for (const pickup of world.pickups) {
    if (pickup.kind !== "coin") {
      continue;
    }

    const distanceToPickup = distance(pos, pickup.pos);
    if (distanceToPickup < selectedDistance) {
      selected = pickup;
      selectedDistance = distanceToPickup;
    }
  }

  return selected;
}

function fleeFromRaft(
  world: WorldState,
  enemy: EnemyState,
  speedMult: number
): void {
  const center = raftCenter(world.raft);
  const dir = normalize({
    x: enemy.pos.x - center.x,
    y: enemy.pos.y - center.y
  });
  const speed =
    effectiveSpeed(enemy) * speedMult;
  const step = speed / TICK_RATE;
  enemy.pos = {
    x: enemy.pos.x + dir.x * step,
    y: enemy.pos.y + dir.y * step
  };
}

function raftCenter(raft: WorldState["raft"]): Vec2 {
  return {
    x: (raft.minCol + raft.maxCol + 1) / 2,
    y: (raft.minRow + raft.maxRow + 1) / 2
  };
}

function isOutsideRaftBy(
  pos: Vec2,
  raft: WorldState["raft"],
  margin: number
): boolean {
  return (
    pos.x < raft.minCol - margin ||
    pos.x > raft.maxCol + 1 + margin ||
    pos.y < raft.minRow - margin ||
    pos.y > raft.maxRow + 1 + margin
  );
}

function movePlayerOnRaft(
  world: WorldState,
  currentPos: Vec2,
  nextPos: Vec2
): Vec2 {
  const clamped = clampToRaft(nextPos, world.raft);
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

function clampToRaft(pos: Vec2, raft: WorldState["raft"]): Vec2 {
  return {
    x: clamp(pos.x, raft.minCol + PLAYER_RADIUS, raft.maxCol + 1 - PLAYER_RADIUS),
    y: clamp(pos.y, raft.minRow + PLAYER_RADIUS, raft.maxRow + 1 - PLAYER_RADIUS)
  };
}

function clampEnemyToRaft(
  pos: Vec2,
  enemy: EnemyState,
  raft: WorldState["raft"]
): Vec2 {
  return {
    x: clamp(pos.x, raft.minCol + enemy.radius, raft.maxCol + 1 - enemy.radius),
    y: clamp(pos.y, raft.minRow + enemy.radius, raft.maxRow + 1 - enemy.radius)
  };
}

function tileCenter(tile: RaftTile): Vec2 {
  return { x: tile.col + 0.5, y: tile.row + 0.5 };
}

function tileId(tile: RaftTile): string {
  return `${tile.col},${tile.row}`;
}

function tileById(world: WorldState, id: string | null): RaftTile | null {
  if (id === null) {
    return null;
  }

  const [colText, rowText] = id.split(",");
  const col = Number(colText);
  const row = Number(rowText);
  const tile = tileAt(world.raft, col, row);
  if (tile === undefined) {
    return null;
  }

  if (tile.kind === "core") {
    return tile.hp > 0 ? tile : null;
  }

  return tile.broken ? null : tile;
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
