import type { Snapshot, WireEvent } from "@patchwork/protocol";

export interface RunStats {
  enemiesSunk: number;
  tilesRepaired: number;
  wavesReached: number;
  finalCoins: number;
  finalSalvage: number;
}

export function createRunStats(): RunStats {
  return {
    enemiesSunk: 0,
    tilesRepaired: 0,
    wavesReached: 1,
    finalCoins: 0,
    finalSalvage: 0
  };
}

export function applyEventsToStats(stats: RunStats, events: readonly WireEvent[]): RunStats {
  let enemiesSunk = stats.enemiesSunk;
  let tilesRepaired = stats.tilesRepaired;

  for (const event of events) {
    if (event.type === "enemy_killed") {
      enemiesSunk += 1;
    } else if (event.type === "tile_repaired") {
      tilesRepaired += 1;
    }
  }

  return { ...stats, enemiesSunk, tilesRepaired };
}

export function applySnapshotToStats(
  stats: RunStats,
  snapshot: Snapshot | undefined,
  myPlayerId: string | undefined
): RunStats {
  if (snapshot === undefined) {
    return stats;
  }

  const ownPlayer = snapshot.players.find((player) => player.id === myPlayerId);

  return {
    ...stats,
    wavesReached: Math.max(stats.wavesReached, snapshot.wave.number),
    finalCoins: ownPlayer?.coins ?? stats.finalCoins,
    finalSalvage: snapshot.salvage ?? stats.finalSalvage
  };
}
