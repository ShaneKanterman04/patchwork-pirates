import type { RaftView } from "@patchwork/protocol";

const BOB_AMPLITUDE_TILES = 0.025;
const BOB_SPEED = 0.006;

export function isEnemyOnDeck(raft: RaftView | undefined, x: number, y: number): boolean {
  if (raft === undefined) {
    return false;
  }

  const col = Math.floor(x);
  const row = Math.floor(y);
  const tile = raft.tiles.find((candidate) => candidate.col === col && candidate.row === row);
  return tile !== undefined && !tile.broken;
}

export function enemyBobOffset(enemyId: string, timeMs: number): number {
  return Math.sin(timeMs * BOB_SPEED + stablePhase(enemyId)) * BOB_AMPLITUDE_TILES;
}

function stablePhase(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return (hash % 6283) / 1000;
}
