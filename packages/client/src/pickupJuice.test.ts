import { describe, expect, it } from "vitest";
import type { PickupView, PlayerView } from "@patchwork/protocol";
import { detectCollectedPickups } from "./pickupJuice";

describe("pickup juice", () => {
  it("detects pickups that disappear near an active player", () => {
    expect(
      detectCollectedPickups(
        [{ id: "coin-1", kind: "coin", x: 2, y: 2 }],
        [],
        [player({ id: "p1", x: 2.4, y: 2.1 })]
      )
    ).toEqual([
      {
        id: "coin-1",
        kind: "coin",
        x: 2,
        y: 2,
        ownerId: "p1",
        ownerX: 2.4,
        ownerY: 2.1
      }
    ]);
  });

  it("ignores pickups that still exist or vanish away from players", () => {
    const previous: PickupView[] = [{ id: "salvage-1", kind: "salvage", x: 2, y: 2 }];
    expect(detectCollectedPickups(previous, previous, [player({ x: 2, y: 2 })])).toEqual([]);
    expect(detectCollectedPickups(previous, [], [player({ x: 5, y: 5 })])).toEqual([]);
  });
});

function player(overrides: Partial<PlayerView>): PlayerView {
  return {
    id: "p1",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    facingX: 1,
    facingY: 0,
    downed: false,
    weaponIds: [],
    ...overrides
  };
}
