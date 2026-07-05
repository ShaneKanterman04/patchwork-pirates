import type { PlayerId, PlayerInput, RaftTile, Vec2, WorldState } from "@patchwork/sim";

export type Bot = (world: WorldState, playerId: PlayerId) => PlayerInput;

const ZERO_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const INTERACT_RANGE = 1.2;
const KITE_CENTER = { x: 2.5, y: 2.5 };
const KITE_RADIUS = 1.75;

export const standAndFight: Bot = (world, playerId) => {
  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    return ZERO_INPUT;
  }

  return {
    movement: { x: 0, y: 0 },
    dash: false,
    interact: nearestDamagedTile(world, player.pos, INTERACT_RANGE) !== null
  };
};

export const kiteCircles: Bot = (world, playerId) => {
  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    return ZERO_INPUT;
  }

  return {
    movement: movementToward(player.pos, kiteTarget(world, playerId)),
    dash: false,
    interact: false
  };
};

export const repairPriority: Bot = (world, playerId) => {
  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    return ZERO_INPUT;
  }

  const target = nearestDamagedTile(world, player.pos, Infinity);
  if (target === null) {
    return kiteCircles(world, playerId);
  }

  const targetPos = tileCenter(target);
  return {
    movement: movementToward(player.pos, targetPos),
    dash: false,
    interact: distance(player.pos, targetPos) <= INTERACT_RANGE
  };
};

export const BOTS = {
  standAndFight,
  kiteCircles,
  repairPriority
} as const;

function kiteTarget(world: WorldState, playerId: PlayerId): Vec2 {
  const offset = playerOffset(playerId);
  const angle = world.tick / 75 + offset;

  return {
    x: KITE_CENTER.x + Math.cos(angle) * KITE_RADIUS,
    y: KITE_CENTER.y + Math.sin(angle) * KITE_RADIUS
  };
}

function playerOffset(playerId: PlayerId): number {
  let hash = 0;
  for (const char of playerId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return (hash % 360) * Math.PI / 180;
}

function nearestDamagedTile(
  world: WorldState,
  pos: Vec2,
  maxDistance: number
): RaftTile | null {
  let selected: RaftTile | null = null;
  let selectedDistance = maxDistance;

  for (const tile of world.raft.tiles) {
    if (!tile.broken && tile.hp >= tile.maxHp) {
      continue;
    }

    const tileDistance = distance(pos, tileCenter(tile));
    if (tileDistance < selectedDistance) {
      selected = tile;
      selectedDistance = tileDistance;
    }
  }

  return selected;
}

function movementToward(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length <= 0.05) {
    return { x: 0, y: 0 };
  }

  return {
    x: dx / length,
    y: dy / length
  };
}

function tileCenter(tile: RaftTile): Vec2 {
  return { x: tile.col + 0.5, y: tile.row + 0.5 };
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
