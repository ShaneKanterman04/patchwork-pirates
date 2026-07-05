import { describe, expect, it } from "vitest";
import type { RaftView, ShopOfferView } from "@patchwork/protocol";
import {
  canAffordOffer,
  canPlaceOnTile,
  expansionSites,
  nearestBuildTile,
  nearestExpansionSite,
  screenPointToTile
} from "./shopLogic";

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

  it("finds the perimeter-adjacent expansion sites of an intact 5x5 raft", () => {
    expect(expansionSites(intactRaft(5, 5))).toEqual([
      { col: 0, row: -1 },
      { col: 1, row: -1 },
      { col: 2, row: -1 },
      { col: 3, row: -1 },
      { col: 4, row: -1 },
      { col: -1, row: 0 },
      { col: 5, row: 0 },
      { col: -1, row: 1 },
      { col: 5, row: 1 },
      { col: -1, row: 2 },
      { col: 5, row: 2 },
      { col: -1, row: 3 },
      { col: 5, row: 3 },
      { col: -1, row: 4 },
      { col: 5, row: 4 },
      { col: 0, row: 5 },
      { col: 1, row: 5 },
      { col: 2, row: 5 },
      { col: 3, row: 5 },
      { col: 4, row: 5 }
    ]);
  });

  it("counts broken tiles as occupied expansion anchors and excludes occupied holes", () => {
    expect(expansionSites(raft())).toEqual([
      { col: 0, row: -1 },
      { col: 1, row: -1 },
      { col: 2, row: -1 },
      { col: -1, row: 0 },
      { col: 3, row: 0 },
      { col: -1, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 0, row: 2 }
    ]);
  });

  it("deduplicates expansion sites and supports negative coordinates", () => {
    expect(
      expansionSites({
        width: 2,
        height: 2,
        tiles: [
          { col: -1, row: -1, kind: "deck", hpRatio: 1, broken: false },
          { col: 0, row: -1, kind: "deck", hpRatio: 1, broken: false },
          { col: -1, row: 0, kind: "deck", hpRatio: 1, broken: false }
        ]
      })
    ).toEqual([
      { col: -1, row: -2 },
      { col: 0, row: -2 },
      { col: -2, row: -1 },
      { col: 1, row: -1 },
      { col: -2, row: 0 },
      { col: 0, row: 0 },
      { col: -1, row: 1 }
    ]);
  });

  it("finds the nearest expansion site in player range", () => {
    expect(nearestExpansionSite(raft(), { x: 1.52, y: 1.45 })).toEqual({ col: 1, row: 1 });
    expect(nearestExpansionSite(raft(), { x: 8, y: 8 })).toBeUndefined();
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

function intactRaft(width: number, height: number): RaftView {
  const tiles: RaftView["tiles"] = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      tiles.push({
        col,
        row,
        kind: col === 2 && row === 2 ? "core" : "deck",
        hpRatio: 1,
        broken: false
      });
    }
  }

  return { width, height, tiles };
}
