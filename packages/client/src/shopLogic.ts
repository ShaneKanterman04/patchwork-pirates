import type { PlayerView, RaftTileView, RaftView, ShopOfferView } from "@patchwork/protocol";

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

export function canPlaceOnTile(raft: RaftView | undefined, coord: TileCoord): boolean {
  const tile = tileAt(raft, coord);
  return tile !== undefined && tile.kind === "deck" && !tile.broken;
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
