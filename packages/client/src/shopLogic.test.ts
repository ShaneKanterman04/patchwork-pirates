import { describe, expect, it } from "vitest";
import type { RaftView, ShopOfferView } from "@patchwork/protocol";
import { canAffordOffer, canPlaceOnTile, nearestBuildTile, screenPointToTile } from "./shopLogic";

describe("shop logic", () => {
  it("maps screen pixels through the renderer transform to raft tiles", () => {
    const tile = screenPointToTile({ x: 160, y: 70 }, { scale: 50, offsetX: 100, offsetY: 20 }, raft());

    expect(tile).toEqual({ col: 1, row: 1 });
  });

  it("rejects tile placement on holes, core tiles, and outside the raft", () => {
    expect(canPlaceOnTile(raft(), { col: 0, row: 0 })).toBe(true);
    expect(canPlaceOnTile(raft(), { col: 1, row: 0 })).toBe(false);
    expect(canPlaceOnTile(raft(), { col: 2, row: 0 })).toBe(false);
    expect(canPlaceOnTile(raft(), { col: 9, row: 9 })).toBe(false);
    expect(canPlaceOnTile(raft(), { col: 0, row: 0 }, [{ id: "m1", defId: "cannon", col: 0, row: 0, hpRatio: 1 }])).toBe(false);
  });

  it("finds the nearest buildable tile in player range", () => {
    expect(nearestBuildTile(raft(), [], { x: 0.55, y: 0.58 })).toEqual({ col: 0, row: 0 });
    expect(nearestBuildTile(raft(), [{ id: "m1", defId: "cannon", col: 0, row: 0, hpRatio: 1 }], { x: 0.55, y: 0.58 })).toEqual({ col: 0, row: 1 });
    expect(nearestBuildTile(raft(), [], { x: 8, y: 8 })).toBeUndefined();
  });

  it("checks offer affordability including sold offers and weapon cap", () => {
    const weapon: ShopOfferView = { kind: "weapon", defId: "cutlass", price: 10 };
    const item: ShopOfferView = { kind: "item", defId: "magnet", price: 5 };

    expect(canAffordOffer(weapon, 10, 3)).toBe(true);
    expect(canAffordOffer(weapon, 10, 4)).toBe(false);
    expect(canAffordOffer(item, 4, 4)).toBe(false);
    expect(canAffordOffer({ kind: "sold" }, 99, 0)).toBe(false);
  });
});

function raft(): RaftView {
  return {
    width: 3,
    height: 2,
    tiles: [
      { col: 0, row: 0, kind: "deck", hpRatio: 1, broken: false },
      { col: 1, row: 0, kind: "deck", hpRatio: 0, broken: true },
      { col: 2, row: 0, kind: "core", hpRatio: 1, broken: false },
      { col: 0, row: 1, kind: "deck", hpRatio: 0.5, broken: false }
    ]
  };
}
