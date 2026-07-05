import type { PickupView, PlayerView } from "@patchwork/protocol";

export interface CollectedPickup {
  id: string;
  kind: string;
  x: number;
  y: number;
  ownerId: string | undefined;
  ownerX: number;
  ownerY: number;
}

const COLLECTION_DISTANCE_TILES = 1.35;

export function detectCollectedPickups(
  previous: readonly PickupView[],
  current: readonly PickupView[],
  players: readonly PlayerView[]
): CollectedPickup[] {
  const currentIds = new Set(current.map((pickup) => pickup.id));
  const collected: CollectedPickup[] = [];

  for (const pickup of previous) {
    if (currentIds.has(pickup.id)) {
      continue;
    }

    const owner = nearestActivePlayer(pickup, players);
    if (owner === undefined || distance(pickup.x, pickup.y, owner.x, owner.y) > COLLECTION_DISTANCE_TILES) {
      continue;
    }

    collected.push({
      id: pickup.id,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
      ownerId: owner.id,
      ownerX: owner.x,
      ownerY: owner.y
    });
  }

  return collected;
}

function nearestActivePlayer(
  pickup: PickupView,
  players: readonly PlayerView[]
): PlayerView | undefined {
  let nearest: PlayerView | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const player of players) {
    if (player.downed || (player.out ?? false)) {
      continue;
    }

    const playerDistance = distance(pickup.x, pickup.y, player.x, player.y);
    if (playerDistance < nearestDistance) {
      nearestDistance = playerDistance;
      nearest = player;
    }
  }

  return nearest;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
