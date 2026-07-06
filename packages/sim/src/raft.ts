import {
  CORE_MAX_HP,
  MAX_RAFT_TILES,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TILE_MAX_HP
} from "./constants";
import { forceDowned } from "./downed";
import type { RaftState, RaftTile, WorldState } from "./types";

function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function createTile(
  tile: Omit<RaftTile, "patched"> & { patched?: boolean }
): RaftTile {
  Object.defineProperty(tile, "patched", {
    value: tile.patched ?? false,
    writable: true,
    enumerable: false,
    configurable: true
  });

  return tile as RaftTile;
}

export function createRaft(): RaftState {
  const tiles: RaftTile[] = [];
  const tileLookup = new Map<string, RaftTile>();

  for (let row = 0; row < RAFT_HEIGHT; row += 1) {
    for (let col = 0; col < RAFT_WIDTH; col += 1) {
      const kind = col === 2 && row === 2 ? "core" : "deck";
      const maxHp = kind === "core" ? CORE_MAX_HP : TILE_MAX_HP;

      const tile = createTile({
        col,
        row,
        hp: maxHp,
        maxHp,
        kind,
        broken: false
      });

      tiles.push(tile);
      tileLookup.set(tileKey(col, row), tile);
    }
  }

  return {
    width: RAFT_WIDTH,
    height: RAFT_HEIGHT,
    minCol: 0,
    minRow: 0,
    maxCol: RAFT_WIDTH - 1,
    maxRow: RAFT_HEIGHT - 1,
    tiles,
    tileLookup
  };
}

export function buildTile(world: WorldState, col: number, row: number): boolean {
  const salvageCost = world.content.tileBuildSalvageCost ?? 5;

  if (
    world.run.phase !== "build" ||
    tileAt(world.raft, col, row) !== undefined ||
    world.raft.tiles.length >= MAX_RAFT_TILES ||
    world.salvage < salvageCost
  ) {
    return false;
  }

  const hasNeighbor =
    tileAt(world.raft, col + 1, row) !== undefined ||
    tileAt(world.raft, col - 1, row) !== undefined ||
    tileAt(world.raft, col, row + 1) !== undefined ||
    tileAt(world.raft, col, row - 1) !== undefined;

  if (!hasNeighbor) {
    return false;
  }

  const tile = createTile({
    col,
    row,
    hp: TILE_MAX_HP,
    maxHp: TILE_MAX_HP,
    kind: "deck",
    broken: false
  });

  world.salvage -= salvageCost;
  world.raft.tiles.push(tile);
  world.raft.tileLookup.set(tileKey(col, row), tile);
  world.raft.minCol = Math.min(world.raft.minCol, col);
  world.raft.minRow = Math.min(world.raft.minRow, row);
  world.raft.maxCol = Math.max(world.raft.maxCol, col);
  world.raft.maxRow = Math.max(world.raft.maxRow, row);
  world.raft.width = world.raft.maxCol - world.raft.minCol + 1;
  world.raft.height = world.raft.maxRow - world.raft.minRow + 1;
  world.events.push({ type: "tile_built", col, row });

  return true;
}

// Coordinates are raft tile-grid coordinates, not world-space positions.
export function damageTile(
  world: WorldState,
  col: number,
  row: number,
  amount: number
): void {
  const tile = tileAt(world.raft, col, row);
  if (tile === undefined || amount <= 0) {
    return;
  }

  tile.hp = Math.max(0, tile.hp - amount);

  if (tile.kind === "core") {
    if (tile.hp === 0 && !world.coreDestroyed) {
      world.coreDestroyed = true;
      world.events.push({ type: "core_destroyed" });
    }
    return;
  }

  if (tile.hp === 0 && !tile.broken) {
    tile.broken = true;
    world.events.push({ type: "tile_broken", col, row });
    downPlayersOnBrokenTile(world, col, row);
  }
}

function downPlayersOnBrokenTile(
  world: WorldState,
  col: number,
  row: number
): void {
  for (const player of world.players) {
    if (
      Math.floor(player.pos.x) !== col ||
      Math.floor(player.pos.y) !== row
    ) {
      continue;
    }

    const fell = forceDowned(world, player.id);
    if (fell) {
      world.events.push({
        type: "player_fell",
        playerId: player.id,
        pos: { ...player.pos }
      });
    }
  }
}

export function tileAt(
  raft: RaftState,
  col: number,
  row: number
): RaftTile | undefined {
  return raft.tileLookup.get(tileKey(col, row));
}

export function isHole(raft: RaftState, col: number, row: number): boolean {
  const tile = tileAt(raft, col, row);
  return tile?.kind === "deck" && tile.broken;
}

export function isWalkable(raft: RaftState, x: number, y: number): boolean {
  const col = Math.floor(x);
  const row = Math.floor(y);
  const tile = tileAt(raft, col, row);
  return tile !== undefined && !isHole(raft, col, row);
}
