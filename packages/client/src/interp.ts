import type { EnemyView, PickupView, PlayerView, Snapshot } from "@patchwork/protocol";

export const INTERP_DELAY_MS = 100;

export interface BufferedSnapshot {
  recvTimeMs: number;
  snapshot: Snapshot;
}

export interface InterpolatedState {
  players: PlayerView[];
  enemies: EnemyView[];
  pickups: PickupView[];
}

export function interpolate(
  buffer: readonly BufferedSnapshot[],
  renderTimeMs: number
): InterpolatedState {
  if (buffer.length === 0) {
    return { players: [], enemies: [], pickups: [] };
  }

  if (buffer.length === 1) {
    return snapshotToState(buffer[0]!.snapshot);
  }

  const first = buffer[0]!;
  const last = buffer[buffer.length - 1]!;

  if (renderTimeMs <= first.recvTimeMs) {
    return snapshotToState(first.snapshot);
  }

  if (renderTimeMs >= last.recvTimeMs) {
    return snapshotToState(last.snapshot);
  }

  for (let index = 1; index < buffer.length; index += 1) {
    const newer = buffer[index]!;

    if (newer.recvTimeMs >= renderTimeMs) {
      const older = buffer[index - 1]!;
      const spanMs = newer.recvTimeMs - older.recvTimeMs;
      const alpha = spanMs <= 0 ? 1 : (renderTimeMs - older.recvTimeMs) / spanMs;

      return {
        players: interpolateById(older.snapshot.players, newer.snapshot.players, alpha),
        enemies: interpolateById(older.snapshot.enemies, newer.snapshot.enemies, alpha),
        pickups: interpolateById(older.snapshot.pickups, newer.snapshot.pickups, alpha)
      };
    }
  }

  return snapshotToState(last.snapshot);
}

function snapshotToState(snapshot: Snapshot): InterpolatedState {
  return {
    players: snapshot.players.map((player) => ({ ...player })),
    enemies: snapshot.enemies.map((enemy) => ({ ...enemy })),
    pickups: snapshot.pickups.map((pickup) => ({ ...pickup }))
  };
}

function interpolateById<T extends { id: string; x: number; y: number }>(
  olderItems: readonly T[],
  newerItems: readonly T[],
  alpha: number
): T[] {
  const olderById = new Map(olderItems.map((item) => [item.id, item]));

  return newerItems.map((newer) => {
    const older = olderById.get(newer.id);

    if (older === undefined) {
      return { ...newer };
    }

    return {
      ...newer,
      x: lerp(older.x, newer.x, alpha),
      y: lerp(older.y, newer.y, alpha)
    };
  });
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}
