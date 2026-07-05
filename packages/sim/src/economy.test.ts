import { describe, expect, it } from "vitest";

import {
  BASE_REROLL_COST,
  REROLL_COST_STEP,
  TICK_RATE,
  WAVE_CLEAR_SALVAGE,
  addPlayer,
  buyOffer,
  collectPickups,
  createEnemy,
  createWorld,
  purchaseModule,
  rerollShop,
  resolveEnemyDeaths,
  tick,
  toggleLock
} from "./index";
import type {
  ContentRegistry,
  EnemyDef,
  ItemDef,
  ModuleDef,
  PlayerInput,
  WaveDef,
  WeaponDef,
  WorldState
} from "./index";

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const CUTLASS: WeaponDef = {
  id: "cutlass",
  name: "Cutlass",
  shopPrice: 10,
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 10,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
};

const HARPOON: WeaponDef = {
  id: "harpoon",
  name: "Harpoon",
  shopPrice: 20,
  targeting: "nearest",
  cooldownS: 1.2,
  rangeTiles: 5,
  damage: 6,
  pattern: {
    kind: "projectile",
    projectileSpeed: 12,
    homing: false
  }
};

const PLATED_HULL: ItemDef = {
  id: "plated_hull",
  name: "Plated Hull",
  basePrice: 12,
  modifiers: { maxHp: 20 }
};

const MAGNET: ItemDef = {
  id: "magnet",
  name: "Magnet",
  basePrice: 8,
  modifiers: { pickupRadius: 0.5, damageMult: 0.1 }
};

const CHUM = enemyDef("chum", 0);
const PLANK_BITER = enemyDef("plank_biter", 3);

const CANNON: ModuleDef = {
  id: "cannon",
  name: "Cannon",
  maxHp: 60,
  salvageCost: 7,
  behavior: {
    kind: "cannon",
    cooldownS: 1,
    rangeTiles: 4,
    damage: 14,
    projectileSpeed: 9
  }
};

const WAVE: WaveDef = {
  durationS: 10,
  budget: 0,
  table: []
};

const CONTENT: ContentRegistry = {
  weapons: { cutlass: CUTLASS, harpoon: HARPOON },
  characters: {},
  items: { plated_hull: PLATED_HULL, magnet: MAGNET },
  enemies: { chum: CHUM, plank_biter: PLANK_BITER },
  modules: { cannon: CANNON },
  waves: Array.from({ length: 8 }, () => WAVE)
};

describe("pickup collection", () => {
  it("collects in-range coin and salvage pickups and leaves out-of-range pickups", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1");
    world.pickups.push(
      { id: "coin", kind: "coin", pos: { ...player.pos }, value: 4 },
      { id: "salvage", kind: "salvage", pos: { x: 2, y: 1.5 }, value: 3 },
      { id: "far", kind: "coin", pos: { x: 4.5, y: 4.5 }, value: 9 }
    );

    collectPickups(world);

    expect(player.coins).toBe(4);
    expect(world.salvage).toBe(3);
    expect(world.pickups).toEqual([
      { id: "far", kind: "coin", pos: { x: 4.5, y: 4.5 }, value: 9 }
    ]);
  });
});

describe("salvage drops", () => {
  it("drops salvage for raft attackers and not for zero-value enemies", () => {
    const world = createWorld(1, CONTENT);
    world.enemies.push(
      { ...createEnemy(world, PLANK_BITER, { x: 1, y: 1 }), hp: 0 },
      { ...createEnemy(world, CHUM, { x: 2, y: 1 }), hp: 0 }
    );

    resolveEnemyDeaths(world);

    expect(world.pickups.filter((pickup) => pickup.kind === "coin")).toHaveLength(2);
    expect(world.pickups.filter((pickup) => pickup.kind === "salvage")).toEqual([
      { id: "e4", kind: "salvage", pos: { x: 1, y: 1 }, value: 3 }
    ]);
  });
});

describe("weapon stat scaling", () => {
  it("scales damage and cooldown from the wielder's stats", () => {
    const world = createWorld(1, CONTENT);
    const player = addPlayer(world, "p1", ["cutlass"]);
    player.damageMult = 2;
    player.attackSpeedMult = 2;
    const enemy = createEnemy(world, CHUM, {
      x: player.pos.x + 1,
      y: player.pos.y
    });
    enemy.hp = 30;
    enemy.maxHp = 30;
    world.enemies.push(enemy);

    tick(world, new Map([["p1", IDLE_INPUT]]));

    expect(enemy.hp).toBe(10);
    expect(player.weapons[0]?.cooldownTicks).toBe(
      Math.max(1, Math.round((CUTLASS.cooldownS * TICK_RATE) / 2)) - 1
    );
  });
});

describe("shop transactions", () => {
  it("generates four wave-scaled offers when combat enters build", () => {
    const world = createWorld(1, CONTENT);
    addPlayer(world, "p1");
    world.run.wave = 3;
    world.run.phaseTicksLeft = 1;

    tick(world, new Map([["p1", IDLE_INPUT]]));

    const shop = world.players[0]?.shop;
    expect(world.salvage).toBe(WAVE_CLEAR_SALVAGE);
    expect(shop?.offers).toHaveLength(4);
    expect(shop?.locked).toEqual([false, false, false, false]);
    expect(shop?.rerollCost).toBe(BASE_REROLL_COST);
    for (const offer of shop?.offers ?? []) {
      expect(offer.kind).not.toBe("sold");
      if (offer.kind === "weapon") {
        const def = CONTENT.weapons[offer.defId];
        expect(def).toBeDefined();
        expect(offer.price).toBe(scaledPrice(def?.shopPrice ?? 0, 3));
      } else if (offer.kind === "item") {
        const def = CONTENT.items[offer.defId];
        expect(def).toBeDefined();
        expect(offer.price).toBe(scaledPrice(def?.basePrice ?? 0, 3));
      }
    }
  });

  it("buys weapons and items, validates funds and weapon cap, and blocks outside build", () => {
    const world = createWorld(2, CONTENT);
    const player = addPlayer(world, "p1", ["cutlass", "cutlass", "cutlass"]);
    player.coins = 100;
    world.run.phase = "build";
    player.shop = {
      offers: [
        { kind: "weapon", defId: "harpoon", price: 20 },
        { kind: "item", defId: "plated_hull", price: 12 },
        { kind: "weapon", defId: "cutlass", price: 10 },
        { kind: "item", defId: "magnet", price: 80 }
      ],
      locked: [false, false, false, false],
      rerollCost: BASE_REROLL_COST
    };

    expect(buyOffer(world, "p1", 0)).toBe(true);
    expect(player.coins).toBe(80);
    expect(player.weapons.map((weapon) => weapon.defId)).toEqual([
      "cutlass",
      "cutlass",
      "cutlass",
      "harpoon"
    ]);
    expect(player.shop.offers[0]).toEqual({ kind: "sold" });

    expect(buyOffer(world, "p1", 2)).toBe(false);
    expect(player.weapons).toHaveLength(4);

    const beforeHp = player.hp;
    expect(buyOffer(world, "p1", 1)).toBe(true);
    expect(player.maxHp).toBe(120);
    expect(player.hp).toBe(beforeHp + 20);
    expect(player.items).toEqual(["plated_hull"]);

    player.coins = 0;
    expect(buyOffer(world, "p1", 3)).toBe(false);
    world.run.phase = "combat";
    expect(buyOffer(world, "p1", 3)).toBe(false);
  });

  it("rerolls unlocked non-sold offers, escalates cost, respects locks, and toggles locks", () => {
    const world = createWorld(3, CONTENT);
    const player = addPlayer(world, "p1");
    player.coins = 20;
    world.run.phase = "build";
    player.shop = {
      offers: [
        { kind: "weapon", defId: "cutlass", price: 10 },
        { kind: "item", defId: "plated_hull", price: 12 },
        { kind: "sold" },
        { kind: "weapon", defId: "harpoon", price: 20 }
      ],
      locked: [false, true, false, false],
      rerollCost: BASE_REROLL_COST
    };

    toggleLock(world, "p1", 0);
    expect(player.shop.locked[0]).toBe(true);
    toggleLock(world, "p1", 0);
    expect(player.shop.locked[0]).toBe(false);

    const lockedOffer = player.shop.offers[1];
    expect(rerollShop(world, "p1")).toBe(true);

    expect(player.coins).toBe(15);
    expect(player.shop.rerollCost).toBe(BASE_REROLL_COST + REROLL_COST_STEP);
    expect(player.shop.offers[1]).toEqual(lockedOffer);
    expect(player.shop.offers[2]).toEqual({ kind: "sold" });

    world.run.phase = "combat";
    expect(rerollShop(world, "p1")).toBe(false);
    const locked = [...player.shop.locked];
    toggleLock(world, "p1", 3);
    expect(player.shop.locked).toEqual(locked);
  });
});

describe("module purchases", () => {
  it("spends shared salvage and places modules, with no charge on failures", () => {
    const world = createWorld(4, CONTENT);
    addPlayer(world, "p1");
    world.run.phase = "build";
    world.salvage = 7;

    expect(purchaseModule(world, "p1", "cannon", 1, 1)).toBe(true);
    expect(world.salvage).toBe(0);
    expect(world.modules).toMatchObject([{ defId: "cannon", col: 1, row: 1 }]);

    expect(purchaseModule(world, "p1", "cannon", 0, 0)).toBe(false);
    expect(world.salvage).toBe(0);

    world.salvage = 7;
    expect(purchaseModule(world, "p1", "cannon", 2, 2)).toBe(false);
    expect(world.salvage).toBe(7);
  });
});

describe("economy determinism", () => {
  it("replays full economy state with identical seeds, inputs, and transactions", () => {
    const first = scriptedRun();
    const second = scriptedRun();

    expect(first).toEqual(second);
  });
});

function scriptedRun(): WorldState {
  const world = createWorld(99, CONTENT);
  const player = addPlayer(world, "p1", ["cutlass"]);
  player.coins = 50;
  world.run.wave = 2;
  world.run.phaseTicksLeft = 1;
  tick(world, new Map([["p1", IDLE_INPUT]]));
  toggleLock(world, "p1", 0);
  rerollShop(world, "p1");
  buyOffer(world, "p1", firstPurchasableOfferIndex(world));
  purchaseModule(world, "p1", "cannon", 1, 1);
  tick(world, new Map([["p1", IDLE_INPUT]]));
  return world;
}

function firstPurchasableOfferIndex(world: WorldState): number {
  const player = world.players[0];
  if (player === undefined) {
    return 0;
  }

  const index = player.shop.offers.findIndex((offer) => offer.kind !== "sold");
  return index === -1 ? 0 : index;
}

function enemyDef(id: string, salvageValue: number): EnemyDef {
  return {
    id,
    name: id,
    maxHp: 20,
    speedTilesPerSec: 0,
    contactDamage: 0,
    contactCooldownS: 1,
    radius: 0.3,
    coinValue: 1,
    salvageValue,
    behavior: { kind: "swarmer_melee" }
  };
}

function scaledPrice(basePrice: number, wave: number): number {
  return Math.round(basePrice * (1 + 0.15 * (wave - 1)));
}
