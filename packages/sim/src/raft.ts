import {
  CORE_MAX_HP,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TILE_MAX_HP
} from "./constants";
import type { RaftState, RaftTile, WorldState } from "./types";

export function createRaft(): RaftState {
  const tiles: RaftTile[] = [];

  for (let row = 0; row < RAFT_HEIGHT; row += 1) {
    for (let col = 0; col < RAFT_WIDTH; col += 1) {
      const kind = col === 2 && row === 2 ? "core" : "deck";
      const maxHp = kind === "core" ? CORE_MAX_HP : TILE_MAX_HP;

      tiles.push({
        col,
        row,
        hp: maxHp,
        maxHp,
        kind,
        broken: false
      });
    }
  }

  return {
    width: RAFT_WIDTH,
    height: RAFT_HEIGHT,
    tiles
  };
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
  }
}

export function tileAt(
  raft: RaftState,
  col: number,
  row: number
): RaftTile | undefined {
  if (col < 0 || col >= raft.width || row < 0 || row >= raft.height) {
    return undefined;
  }

  return raft.tiles[row * raft.width + col];
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
