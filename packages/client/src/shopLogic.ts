import type { ModuleView, PlayerView, RaftTileView, RaftView, ShopOfferView } from "@patchwork/protocol";

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TileCoord {
  col: number;
  row: number;
}

export function screenToWorld(point: ScreenPoint, transform: ViewportTransform): ScreenPoint {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale
  };
}

export function screenPointToTile(
  point: ScreenPoint,
  transform: ViewportTransform,
  raft: RaftView | undefined
): TileCoord | undefined {
  const world = screenToWorld(point, transform);
  const col = Math.floor(world.x);
  const row = Math.floor(world.y);
  const width = raft?.width ?? 5;
  const height = raft?.height ?? 5;

  if (col < 0 || row < 0 || col >= width || row >= height) {
    return undefined;
  }

  return { col, row };
}

export function tileAt(raft: RaftView | undefined, coord: TileCoord): RaftTileView | undefined {
  return raft?.tiles.find((tile) => tile.col === coord.col && tile.row === coord.row);
}

export function canPlaceOnTile(
  raft: RaftView | undefined,
  coord: TileCoord,
  modules: readonly ModuleView[] = []
): boolean {
  const tile = tileAt(raft, coord);
  return (
    tile !== undefined &&
    tile.kind === "deck" &&
    !tile.broken &&
    !modules.some((module) => module.col === coord.col && module.row === coord.row)
  );
}

export function nearestBuildTile(
  raft: RaftView | undefined,
  modules: readonly ModuleView[],
  player: Pick<PlayerView, "x" | "y"> | undefined,
  rangeTiles = 1.2
): TileCoord | undefined {
  if (raft === undefined || player === undefined) {
    return undefined;
  }

  let selected: TileCoord | undefined;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const rangeSquared = rangeTiles * rangeTiles;

  for (const tile of raft.tiles) {
    const coord = { col: tile.col, row: tile.row };
    if (!canPlaceOnTile(raft, coord, modules)) {
      continue;
    }

    const dx = tile.col + 0.5 - player.x;
    const dy = tile.row + 0.5 - player.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > rangeSquared || distanceSquared >= selectedDistanceSquared) {
      continue;
    }

    selected = coord;
    selectedDistanceSquared = distanceSquared;
  }

  return selected;
}

export function canAffordOffer(
  offer: ShopOfferView,
  coins: number,
  weaponCount: number,
  maxWeapons = 4
): boolean {
  if (offer.kind === "sold") {
    return false;
  }

  if (offer.kind === "weapon" && weaponCount >= maxWeapons) {
    return false;
  }

  return coins >= offer.price;
}

export function ownCoins(player: PlayerView | undefined): number {
  return player?.coins ?? 0;
}
