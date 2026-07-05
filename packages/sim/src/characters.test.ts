import { describe, expect, it } from "vitest";

import {
  AURA_RADIUS,
  BASE_PICKUP_RADIUS,
  MARK_DAMAGE_MULT,
  MARK_DURATION_S,
  MARK_INTERVAL_S,
  TICK_RATE,
  addPlayer,
  createWorld,
  selectTarget,
  tick
} from "./index";
import type {
  CharacterDef,
  ContentRegistry,
  EnemyDef,
  EnemyState,
  PlayerInput,
  Vec2,
  WeaponDef,
  WorldState
} from "./index";

const CUTLASS: WeaponDef = {
  id: "cutlass",
  name: "Cutlass",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 0.7,
  rangeTiles: 1.4,
  damage: 10,
  pattern: { kind: "melee_arc", arcDegrees: 90 }
};

const HARPOON_GUN: WeaponDef = {
  id: "harpoon_gun",
  name: "Harpoon Gun",
  shopPrice: 16,
  targeting: "attacking_raft",
  cooldownS: 1.1,
  rangeTiles: 5,
  damage: 10,
  tags: ["harpoon", "defensive"],
  pattern: { kind: "projectile", projectileSpeed: 30, homing: true }
};

const TEST_HARPOON: WeaponDef = {
  ...HARPOON_GUN,
  id: "test_harpoon",
  targeting: "nearest",
  tags: ["harpoon"]
};

const LOB: WeaponDef = {
  id: "lob",
  name: "Lob",
  shopPrice: 12,
  targeting: "nearest",
  cooldownS: 1,
  rangeTiles: 5,
  damage: 10,
  pattern: { kind: "lob", projectileSpeed: 30, aoeRadius: 1 }
};

const CAPTAIN: CharacterDef = {
  id: "captain",
  name: "Captain",
  startingWeaponId: "cutlass",
  statProfile: {},
  passive: "attack_speed_aura",
  special: "mark_dangerous"
};

const FISHER: CharacterDef = {
  id: "fisher",
  name: "Fisher",
  startingWeaponId: "harpoon_gun",
  statProfile: { pickupRadius: 0.6 },
  passive: "none",
  special: "harpoon_raft_priority"
};

const CONTENT: ContentRegistry = {
  weapons: {
    cutlass: CUTLASS,
    harpoon_gun: HARPOON_GUN,
    test_harpoon: TEST_HARPOON,
    lob: LOB
  },
  characters: { captain: CAPTAIN, fisher: FISHER },
  items: {},
  enemies: {
    chum: enemyDef("chum", 100, 0),
    biter: enemyDef("biter", 100, 10)
  },
  modules: {},
  waves: []
};

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

describe("characters", () => {
  it("adds captain and fisher character starts and stat profiles", () => {
    const world = createWorld(1, CONTENT);

    const captain = addPlayer(world, "captain", [], "captain");
    const fisher = addPlayer(world, "fisher", [], "fisher");

    expect(captain.weapons.map((weapon) => weapon.defId)).toEqual(["cutlass"]);
    expect(captain.passive).toBe("attack_speed_aura");
    expect(captain.special).toBe("mark_dangerous");
    expect(fisher.weapons.map((weapon) => weapon.defId)).toEqual([
      "harpoon_gun"
    ]);
    expect(fisher.pickupRadius).toBeCloseTo(BASE_PICKUP_RADIUS + 0.6);
  });

  it("applies captain aura to nearby teammates and removes it out of range or downed", () => {
    const withCaptain = createWorld(1, CONTENT);
    withCaptain.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const captain = addPlayer(withCaptain, "captain", [], "captain");
    const teammate = addPlayer(withCaptain, "teammate", ["cutlass"]);
    captain.pos = { x: 1.5, y: 1.5 };
    teammate.pos = { x: captain.pos.x + AURA_RADIUS - 0.1, y: captain.pos.y };
    addEnemy(withCaptain, "target", "chum", {
      x: teammate.pos.x + 1,
      y: teammate.pos.y
    });

    tick(withCaptain, new Map([["teammate", IDLE_INPUT]]));
    const auraCooldown = teammate.weapons[0]?.cooldownTicks;

    const noCaptain = createWorld(1, CONTENT);
    noCaptain.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const baseline = addPlayer(noCaptain, "teammate", ["cutlass"]);
    baseline.pos = { ...teammate.pos };
    addEnemy(noCaptain, "target", "chum", {
      x: baseline.pos.x + 1,
      y: baseline.pos.y
    });

    tick(noCaptain, new Map([["teammate", IDLE_INPUT]]));
    const baselineCooldown = baseline.weapons[0]?.cooldownTicks;

    expect(auraCooldown).toBeLessThan(baselineCooldown ?? 0);

    teammate.weapons[0] = { defId: "cutlass", cooldownTicks: 0 };
    teammate.pos = { x: captain.pos.x + AURA_RADIUS + 0.2, y: captain.pos.y };
    addEnemy(withCaptain, "far_target", "chum", {
      x: teammate.pos.x + 1,
      y: teammate.pos.y
    });
    tick(withCaptain, new Map([["teammate", IDLE_INPUT]]));
    expect(teammate.weapons[0]?.cooldownTicks).toBe(baselineCooldown);

    teammate.weapons[0] = { defId: "cutlass", cooldownTicks: 0 };
    captain.pos = { x: 1.5, y: 1.5 };
    teammate.pos = { x: captain.pos.x + AURA_RADIUS - 0.1, y: captain.pos.y };
    captain.downed = true;
    addEnemy(withCaptain, "downed_target", "chum", {
      x: teammate.pos.x + 1,
      y: teammate.pos.y
    });
    tick(withCaptain, new Map([["teammate", IDLE_INPUT]]));
    expect(teammate.weapons[0]?.cooldownTicks).toBe(baselineCooldown);
  });

  it("marks the most dangerous nearby enemy and expires the mark", () => {
    const world = createWorld(1, CONTENT);
    world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
    const captain = addPlayer(world, "captain", [], "captain");
    const near = addEnemy(world, "near", "chum", {
      x: captain.pos.x + 1,
      y: captain.pos.y
    });
    const dangerous = addEnemy(world, "dangerous", "biter", {
      x: captain.pos.x + 2,
      y: captain.pos.y
    });
    dangerous.attackingTileId = "2,2";

    tick(world, new Map([["captain", IDLE_INPUT]]));

    expect(near.markTicks).toBe(0);
    expect(dangerous.markTicks).toBe(Math.round(MARK_DURATION_S * TICK_RATE) - 1);
    expect(captain.specialCooldownTicks).toBe(
      Math.round(MARK_INTERVAL_S * TICK_RATE)
    );

    for (let i = 0; i < Math.round(MARK_DURATION_S * TICK_RATE) - 1; i += 1) {
      tick(world, new Map([["captain", IDLE_INPUT]]));
    }

    expect(dangerous.markTicks).toBe(0);
  });

  it("multiplies marked enemy damage for melee, projectiles, and lobs", () => {
    const meleeWorld = createDamageWorld("cutlass");
    const meleeEnemy = addMarkedTarget(meleeWorld);
    tick(meleeWorld, new Map([["p1", IDLE_INPUT]]));
    expect(meleeEnemy.hp).toBeCloseTo(100 - CUTLASS.damage * MARK_DAMAGE_MULT);

    const projectileWorld = createDamageWorld("harpoon_gun");
    const projectileEnemy = addMarkedTarget(projectileWorld);
    tick(projectileWorld, new Map([["p1", IDLE_INPUT]]));
    expect(projectileEnemy.hp).toBeCloseTo(
      100 - HARPOON_GUN.damage * MARK_DAMAGE_MULT
    );

    const lobWorld = createDamageWorld("lob");
    const lobEnemy = addMarkedTarget(lobWorld);
    tick(lobWorld, new Map([["p1", IDLE_INPUT]]));
    expect(lobEnemy.hp).toBeCloseTo(100 - LOB.damage * MARK_DAMAGE_MULT);
  });

  it("makes Fisher force harpoon-tag weapons to attacking_raft targeting", () => {
    const world = createWorld(1, CONTENT);
    const fisher = addPlayer(world, "fisher", [], "fisher");
    const near = addEnemy(world, "near", "chum", {
      x: fisher.pos.x + 0.6,
      y: fisher.pos.y
    });
    const raftAttacker = addEnemy(world, "raft_attacker", "chum", {
      x: fisher.pos.x + 2,
      y: fisher.pos.y
    });
    raftAttacker.attackingTileId = "2,2";

    expect(selectTarget(world, fisher, TEST_HARPOON)).toBe(raftAttacker);
    expect(selectTarget(world, fisher, TEST_HARPOON)).not.toBe(near);
  });

  it("replays captain and fisher worlds deterministically", () => {
    const first = createCharacterReplayWorld();
    const second = createCharacterReplayWorld();

    for (let i = 0; i < 120; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect({
      players: first.players,
      enemies: first.enemies,
      pickups: first.pickups,
      projectiles: first.projectiles,
      run: first.run
    }).toEqual({
      players: second.players,
      enemies: second.enemies,
      pickups: second.pickups,
      projectiles: second.projectiles,
      run: second.run
    });
  });
});

function createDamageWorld(weaponId: string): WorldState {
  const world = createWorld(1, CONTENT);
  world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
  addPlayer(world, "p1", [weaponId]);
  return world;
}

function addMarkedTarget(world: WorldState): EnemyState {
  const player = world.players[0];
  if (player === undefined) {
    throw new Error("missing test player");
  }

  const enemy = addEnemy(world, "target", "chum", {
    x: player.pos.x + 1,
    y: player.pos.y
  });
  enemy.markTicks = TICK_RATE;
  return enemy;
}

function createCharacterReplayWorld(): WorldState {
  const world = createWorld(99, CONTENT);
  world.run.spawnTimer = Number.MAX_SAFE_INTEGER;
  addPlayer(world, "captain", [], "captain");
  addPlayer(world, "fisher", [], "fisher");
  addEnemy(world, "seed_chum", "chum", { x: 3.8, y: 1.5 });
  const attacker = addEnemy(world, "seed_biter", "biter", { x: 4.2, y: 2.5 });
  attacker.attackingTileId = "2,2";
  return world;
}

function replayInput(tickIndex: number): Map<string, PlayerInput> {
  const captainMovement =
    tickIndex % 4 === 0
      ? { x: 1, y: 0 }
      : tickIndex % 4 === 1
        ? { x: 0, y: 1 }
        : tickIndex % 4 === 2
          ? { x: -1, y: 0 }
          : { x: 0, y: -1 };

  return new Map([
    [
      "captain",
      {
        movement: captainMovement,
        dash: tickIndex === 8,
        interact: false
      }
    ],
    [
      "fisher",
      {
        movement: { x: 0, y: 0 },
        dash: tickIndex === 32,
        interact: false
      }
    ]
  ]);
}

function enemyDef(id: string, maxHp: number, basePriority: number): EnemyDef {
  return {
    id,
    name: id,
    maxHp,
    speedTilesPerSec: 0,
    contactDamage: 0,
    contactCooldownS: 1,
    radius: 0.3,
    coinValue: 0,
    heavy: false,
    basePriority,
    elite: false,
    behavior: { kind: "swarmer_melee" }
  };
}

function addEnemy(
  world: WorldState,
  id: string,
  type: "chum" | "biter",
  pos: Vec2
): EnemyState {
  const def = CONTENT.enemies[type];
  if (def === undefined) {
    throw new Error(`missing test enemy def: ${type}`);
  }

  const enemy: EnemyState = {
    id,
    type,
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: def.radius,
    speed: def.speedTilesPerSec,
    contactDamage: def.contactDamage,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(def.contactCooldownS * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}
