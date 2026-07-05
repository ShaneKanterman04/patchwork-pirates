import type {
  BossView,
  EnemyView,
  ModuleView,
  PickupView,
  PingView,
  PlayerView,
  ProjView,
  RaftView,
  Snapshot,
  WavePhaseView
} from "@patchwork/protocol";

export const INTERP_DELAY_MS = 100;

export interface BufferedSnapshot {
  recvTimeMs: number;
  snapshot: Snapshot;
}

export interface InterpolatedState {
  players: PlayerView[];
  enemies: EnemyView[];
  projectiles: ProjView[];
  pickups: PickupView[];
  pings: PingView[];
  wave: WavePhaseView;
  raft?: RaftView;
  salvage?: number;
  supplyCap?: number;
  modules: ModuleView[];
  boss?: BossView | null;
}

export function interpolate(
  buffer: readonly BufferedSnapshot[],
  renderTimeMs: number
): InterpolatedState {
  if (buffer.length === 0) {
    return {
      players: [],
      enemies: [],
      projectiles: [],
      pickups: [],
      pings: [],
      wave: { number: 1, phase: "lobby", timeLeft: 0 },
      modules: [],
      boss: null
    };
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
        projectiles: interpolateById(
          older.snapshot.projectiles,
          newer.snapshot.projectiles,
          alpha
        ),
        pickups: interpolateById(older.snapshot.pickups, newer.snapshot.pickups, alpha),
        pings: newer.snapshot.pings ?? [],
        wave: newer.snapshot.wave,
        raft: newer.snapshot.raft,
        salvage: newer.snapshot.salvage,
        supplyCap: newer.snapshot.supplyCap,
        modules: newer.snapshot.modules ?? [],
        boss: newer.snapshot.boss ?? null
      };
    }
  }

  return snapshotToState(last.snapshot);
}

function snapshotToState(snapshot: Snapshot): InterpolatedState {
  return {
    players: snapshot.players,
    enemies: snapshot.enemies,
    projectiles: snapshot.projectiles,
    pickups: snapshot.pickups,
    pings: snapshot.pings ?? [],
    wave: snapshot.wave,
    raft: snapshot.raft,
    salvage: snapshot.salvage,
    supplyCap: snapshot.supplyCap,
    modules: snapshot.modules ?? [],
    boss: snapshot.boss ?? null
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

    if (
      older === undefined ||
      alpha === 1 ||
      (older.x === newer.x && older.y === newer.y)
    ) {
      return newer;
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
