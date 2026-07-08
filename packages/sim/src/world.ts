import {
  BROKEN_TILE_HP_PER_SUPPLY,
  DASH_COOLDOWN_TICKS,
  DASH_DURATION_TICKS,
  DASH_SPEED_MULT,
  DAMAGED_TILE_HP_PER_SUPPLY,
  HOLE_REBUILD_RATE,
  INTERACT_RANGE,
  MASTER_REPAIR_MULT,
  PING_SCAN_RADIUS,
  PING_TTL_S,
  PLAYER_REPAIR_RATE,
  TICK_RATE
} from "./constants";
import { applyAuras, updateSpecials } from "./characters";
import { updateBossAfterSim } from "./boss";
import { hasDownedPlayerInReviveRange, updateDowned } from "./downed";
import { resolveEnemyDeaths, updateEnemies } from "./enemies";
import { updateHazards } from "./hazards";
import { supplyCapacity, updateModules } from "./modules";
import {
  clampMovement,
  clampToRaft,
  normalizeOrZero
} from "./player";
import { updateProjectiles } from "./projectiles";
import { createRaft, isWalkable } from "./raft";
import { createRunState, updateRunPostSim, updateRunPreSim } from "./run";
import { updatePlayerWeapons } from "./weapons";
import type {
  ContentRegistry,
  PlayerId,
  PlayerInput,
  PlayerState,
  PingState,
  RaftTile,
  Vec2,
  WorldState
} from "./types";

const ZERO_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const FACING_EPSILON = 0.000001;
const REPAIR_CHARGE_EPSILON = 0.000001;
const MAX_PINGS = 12;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = nextMulberry32State(state);
    return stateToUnitFloat(scrambleMulberry32State(state));
  };
}

export function nextRandom(world: WorldState): number {
  world.rngState = nextMulberry32State(world.rngState);
  return stateToUnitFloat(scrambleMulberry32State(world.rngState));
}

const EMPTY_CONTENT: ContentRegistry = {
  weapons: {},
  characters: {},
  items: {},
  enemies: {},
  modules: {},
  tileBuildSalvageCost: 5,
  waves: []
};

export function createWorld(
  seed: number,
  content: ContentRegistry = EMPTY_CONTENT
): WorldState {
  return {
    tick: 0,
    rngState: seed >>> 0,
    players: [],
    raft: createRaft(),
    content,
    salvage: 0,
    enemies: [],
    pickups: [],
    pings: [],
    projectiles: [],
    hazards: [],
    modules: [],
    events: [],
    coreDestroyed: false,
    nextEntityId: 1,
    run: createRunState(),
    boss: null
  };
}

export function tick(
  world: WorldState,
  inputs: Map<PlayerId, PlayerInput>
): WorldState {
  world.events = [];

  if (world.run.phase === "lobby" && world.run.budgetRemaining > 0) {
    world.run.phase = "combat";
    if (world.run.phaseTicksLeft <= 0) {
      world.run.phaseTicksLeft = Number.MAX_SAFE_INTEGER;
    }
  }

  if (
    (world.run.phase === "lobby" &&
      world.content.waves.length > 0 &&
      world.run.budgetRemaining <= 0) ||
    world.run.phase === "victory" ||
    world.run.phase === "defeat"
  ) {
    world.tick += 1;
    return world;
  }

  updateRunPreSim(world);

  for (const player of world.players) {
    const input = inputs.get(player.id) ?? ZERO_INPUT;
    if (player.downed || player.out || player.hp <= 0) {
      player.dashTicks = 0;
      player.prevDash = input.dash;
      continue;
    }

    const movement = clampMovement(input.movement);
    const movementDirection = normalizeOrZero(movement);
    const movementMagnitudeSquared =
      movement.x * movement.x + movement.y * movement.y;

    if (movementMagnitudeSquared > FACING_EPSILON * FACING_EPSILON) {
      player.facing = movementDirection;
    }

    if (input.dash && !player.prevDash && player.dashCooldown === 0) {
      player.dashTicks = DASH_DURATION_TICKS;
      player.dashCooldown = DASH_COOLDOWN_TICKS;
      player.dashDir = { ...player.facing };
    }

    const isDashing = player.dashTicks > 0;
    const speed =
      player.moveSpeed * (isDashing ? DASH_SPEED_MULT : 1) / TICK_RATE;
    const direction = isDashing ? player.dashDir : movement;
    const nextPos = moveOnRaft(world, player, {
      x: player.pos.x + direction.x * speed,
      y: player.pos.y + direction.y * speed
    });

    player.pos = nextPos;
    if (!hasDownedPlayerInReviveRange(world, player)) {
      repairNearestTile(world, player);
    }
    player.dashTicks = Math.max(0, player.dashTicks - 1);
    player.dashCooldown = Math.max(0, player.dashCooldown - 1);
    player.prevDash = input.dash;
  }

  applyAuras(world);
  updateSpecials(world);
  updatePlayerWeapons(world);
  updateModules(world);
  updateEnemies(world);
  updateProjectiles(world);
  updateHazards(world);
  resolveEnemyDeaths(world);
  updateBossAfterSim(world);
  updateDowned(world, inputs);
  collectPickups(world);
  updatePings(world);
  updateRunPostSim(world);

  world.tick += 1;
  return world;
}

export function createPing(world: WorldState, playerId: PlayerId): PingState | null {
  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || player.downed || player.out) {
    return null;
  }

  const target = pingTarget(world, player);
  const ping: PingState = {
    id: nextPingId(world),
    kind: target.kind,
    x: target.x,
    y: target.y,
    ttlTicks: PING_TTL_S * TICK_RATE,
    playerId
  };

  world.pings.push(ping);
  if (world.pings.length > MAX_PINGS) {
    world.pings = world.pings.slice(world.pings.length - MAX_PINGS);
  }

  return ping;
}

export function updatePings(world: WorldState): void {
  const remaining: PingState[] = [];

  for (const ping of world.pings) {
    ping.ttlTicks -= 1;
    if (ping.ttlTicks > 0) {
      remaining.push(ping);
    }
  }

  world.pings =
    remaining.length > MAX_PINGS
      ? remaining.slice(remaining.length - MAX_PINGS)
      : remaining;
}

export function collectPickups(world: WorldState): void {
  const remaining: WorldState["pickups"] = [];

  for (const pickup of world.pickups) {
    let selected: PlayerState | null = null;
    let selectedDistanceSquared = Number.POSITIVE_INFINITY;

    for (const player of world.players) {
      if (
        pickup.kind === "food" &&
        (player.downed || player.out || player.hp <= 0 || player.hp >= player.maxHp)
      ) {
        continue;
      }

      const dx = pickup.pos.x - player.pos.x;
      const dy = pickup.pos.y - player.pos.y;
      const distanceSquared = dx * dx + dy * dy;
      const radiusSquared = player.pickupRadius * player.pickupRadius;

      if (distanceSquared > radiusSquared) {
        continue;
      }

      if (
        distanceSquared < selectedDistanceSquared ||
        (distanceSquared === selectedDistanceSquared &&
          selected !== null &&
          player.id < selected.id)
      ) {
        selected = player;
        selectedDistanceSquared = distanceSquared;
      }
    }

    if (selected === null) {
      remaining.push(pickup);
      continue;
    }

    if (pickup.kind === "coin") {
      selected.coins += pickup.value;
    } else if (pickup.kind === "food") {
      selected.hp = Math.min(selected.maxHp, selected.hp + pickup.value);
    } else {
      world.salvage = Math.min(supplyCapacity(world), world.salvage + pickup.value);
    }
  }

  world.pickups = remaining;
}

function moveOnRaft(world: WorldState, player: PlayerState, nextPos: Vec2): Vec2 {
  const clamped = clampToRaft(nextPos, world.raft);
  const currentCol = Math.floor(player.pos.x);
  const currentRow = Math.floor(player.pos.y);

  const candidateX = {
    x: clamped.x,
    y: player.pos.y
  };
  const candidateXCol = Math.floor(candidateX.x);
  const candidateXRow = Math.floor(candidateX.y);
  const x =
    !isWalkable(world.raft, candidateX.x, candidateX.y) &&
    (candidateXCol !== currentCol || candidateXRow !== currentRow)
      ? player.pos.x
      : candidateX.x;

  const candidateY = {
    x,
    y: clamped.y
  };
  const candidateYCol = Math.floor(candidateY.x);
  const candidateYRow = Math.floor(candidateY.y);
  const y =
    !isWalkable(world.raft, candidateY.x, candidateY.y) &&
    (candidateYCol !== currentCol || candidateYRow !== currentRow)
      ? player.pos.y
      : candidateY.y;

  return { x, y };
}

function repairNearestTile(
  world: WorldState,
  player: PlayerState
): void {
  if (world.run.phase !== "build") {
    player.repairChargeHp = 0;
    player.repairTargetKey = null;
    return;
  }

  const tile = nearestRepairTarget(world, player.pos);
  if (tile === null) {
    player.repairChargeHp = 0;
    player.repairTargetKey = null;
    return;
  }

  const targetKey = `${tile.col},${tile.row}`;
  if (player.repairTargetKey !== targetKey) {
    player.repairChargeHp = 0;
    player.repairTargetKey = targetKey;
  }

  const rate = tile.broken ? HOLE_REBUILD_RATE : PLAYER_REPAIR_RATE;
  const baseHpPerSupply = tile.broken
    ? BROKEN_TILE_HP_PER_SUPPLY
    : DAMAGED_TILE_HP_PER_SUPPLY;
  const hpPerSupply =
    player.passive === "master_repairs"
      ? baseHpPerSupply * MASTER_REPAIR_MULT
      : baseHpPerSupply;
  player.repairChargeHp = Math.min(
    hpPerSupply,
    player.repairChargeHp + (rate * player.repairSpeed) / TICK_RATE
  );

  if (player.repairChargeHp + REPAIR_CHARGE_EPSILON < hpPerSupply || world.salvage < 1) {
    return;
  }

  tile.hp = Math.min(tile.maxHp, tile.hp + hpPerSupply);
  world.salvage -= 1;
  player.repairChargeHp = Math.max(0, player.repairChargeHp - hpPerSupply);
  world.events.push({ type: "tile_repaired", col: tile.col, row: tile.row });

  if (tile.hp >= tile.maxHp) {
    tile.patched = true;
    if (tile.broken) {
      tile.broken = false;
      player.stats.tilesRepaired += 1;
    }
  }
}

function pingTarget(
  world: WorldState,
  player: PlayerState
): { kind: PingState["kind"]; x: number; y: number } {
  const enemy = nearestEnemyForPing(world, player.pos);
  if (enemy !== null) {
    return { kind: "danger", x: enemy.pos.x, y: enemy.pos.y };
  }

  const tile = nearestDamagedTileForPing(world, player.pos);
  if (tile !== null) {
    return { kind: "repair", x: tile.col + 0.5, y: tile.row + 0.5 };
  }

  const pickup = nearestPickupForPing(world, player.pos);
  if (pickup !== null) {
    return { kind: "loot", x: pickup.pos.x, y: pickup.pos.y };
  }

  return { kind: "group", x: player.pos.x, y: player.pos.y };
}

function nearestEnemyForPing(
  world: WorldState,
  pos: Vec2
): WorldState["enemies"][number] | null {
  let selected: WorldState["enemies"][number] | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const radiusSquared = PING_SCAN_RADIUS * PING_SCAN_RADIUS;

  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }

    const distanceSquared = squaredDistance(pos, enemy.pos);
    if (distanceSquared <= radiusSquared && distanceSquared < selectedDistanceSquared) {
      selected = enemy;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selected;
}

function nearestDamagedTileForPing(
  world: WorldState,
  pos: Vec2
): RaftTile | null {
  let selected: RaftTile | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const radiusSquared = PING_SCAN_RADIUS * PING_SCAN_RADIUS;

  for (const tile of world.raft.tiles) {
    if (!tile.broken && tile.hp >= tile.maxHp) {
      continue;
    }

    const distanceSquared = squaredDistance(pos, {
      x: tile.col + 0.5,
      y: tile.row + 0.5
    });
    if (distanceSquared <= radiusSquared && distanceSquared < selectedDistanceSquared) {
      selected = tile;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selected;
}

function nearestPickupForPing(
  world: WorldState,
  pos: Vec2
): WorldState["pickups"][number] | null {
  let selected: WorldState["pickups"][number] | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const radiusSquared = PING_SCAN_RADIUS * PING_SCAN_RADIUS;

  for (const pickup of world.pickups) {
    const distanceSquared = squaredDistance(pos, pickup.pos);
    if (distanceSquared <= radiusSquared && distanceSquared < selectedDistanceSquared) {
      selected = pickup;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selected;
}

function nearestRepairTarget(
  world: WorldState,
  pos: Vec2
): RaftTile | null {
  let selected: RaftTile | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const rangeSquared = INTERACT_RANGE * INTERACT_RANGE;

  for (const tile of world.raft.tiles) {
    if (!tile.broken && tile.hp >= tile.maxHp) {
      continue;
    }

    const dx = tile.col + 0.5 - pos.x;
    const dy = tile.row + 0.5 - pos.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > rangeSquared) {
      continue;
    }

    if (distanceSquared < selectedDistanceSquared) {
      selected = tile;
      selectedDistanceSquared = distanceSquared;
    }
  }

  return selected;
}

function nextMulberry32State(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

function nextPingId(world: WorldState): string {
  const id = `ping${world.nextEntityId}`;
  world.nextEntityId += 1;
  return id;
}

function squaredDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function scrambleMulberry32State(state: number): number {
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function stateToUnitFloat(state: number): number {
  return state / 4294967296;
}
