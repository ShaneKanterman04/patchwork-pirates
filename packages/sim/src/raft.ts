import {
  CORE_MAX_HP,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TILE_MAX_HP
} from "./constants";
import type { RaftState, RaftTile } from "./types";

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
