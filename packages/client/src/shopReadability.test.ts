import { describe, expect, it } from "vitest";
import type { PlayerView, ShopOfferView } from "@patchwork/protocol";
import {
  characterLabel,
  itemModifiersText,
  ownedItemText,
  playerStatText,
  purchaseSnapshot,
  purchaseToastText,
  sellRefund,
  weaponStackText,
  weaponStatLine
} from "./shopReadability";
import { WEAPONS } from "@patchwork/content";

describe("shop readability helpers", () => {
  it("formats item modifiers as player-readable stat deltas", () => {
    expect(itemModifiersText({ maxHp: 20 })).toBe("+20 Max HP");
    expect(itemModifiersText({ damageMult: 0.12, attackSpeedMult: 0.08 })).toBe(
      "+12% Damage · +8% Attack Speed"
    );
    expect(itemModifiersText({ moveSpeed: 0.5, repairSpeed: -0.25 })).toBe(
      "+0.5 Move Speed · -0.3 Repair Speed"
    );
  });

  it("formats weapon stats and stacks compactly", () => {
    expect(weaponStatLine(WEAPONS.cutlass)).toBe("DMG 18 · every 0.7s · range 1.4");
    expect(weaponStackText(["cutlass", "coconut_launcher", "cutlass"])).toBe(
      "Weapons 3/4: Cutlass x2, Coconut Launcher x1"
    );
    expect(weaponStackText([])).toBe("Weapons 0/4: None");
  });

  it("calculates weapon sale refunds from shop prices", () => {
    expect(sellRefund("cutlass", WEAPONS)).toBe(Math.floor(WEAPONS.cutlass.shopPrice / 2));
    expect(sellRefund("odd_price", { odd_price: { shopPrice: 13 } })).toBe(6);
    expect(sellRefund("missing", WEAPONS)).toBeUndefined();
  });

  it("summarizes the visible gear fields while guarding missing item wire data", () => {
    const player = playerView({
      characterId: "captain",
      hp: 84.2,
      maxHp: 120,
      stats: { damageDealt: 31.2, tilesRepaired: 2.4, revives: 0 }
    });

    expect(characterLabel(player.characterId)).toBe("Captain");
    expect(ownedItemText(player)).toBe("Items not shown yet");
    expect(playerStatText(player)).toBe("HP 85/120 · Damage 31 · Repairs 2");
  });

  it("detects weapon and item purchase toast copy from snapshots", () => {
    const offers: ShopOfferView[] = [
      { kind: "item", defId: "sharp_cutlass", price: 12 },
      { kind: "weapon", defId: "cutlass", price: 12 }
    ];
    const before = purchaseSnapshot(playerView({ coins: 20, weaponIds: ["cutlass"] }));

    expect(
      purchaseToastText(
        before,
        purchaseSnapshot(playerView({ coins: 8, weaponIds: ["cutlass"] })),
        offers
      )
    ).toBe("Bought Sharp Cutlass - +12% Damage");

    expect(
      purchaseToastText(
        before,
        purchaseSnapshot(playerView({ coins: 8, weaponIds: ["cutlass", "cutlass"] })),
        offers
      )
    ).toBe("Bought Cutlass - DMG 18 · every 0.7s · range 1.4");
  });
});

function playerView(overrides: Partial<PlayerView>): PlayerView {
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
    coins: 0,
    ...overrides
  };
}
