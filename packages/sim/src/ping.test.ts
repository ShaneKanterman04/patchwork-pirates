import { describe, expect, it } from "vitest";

import {
  PING_TTL_S,
  TICK_RATE,
  addPlayer,
  createPing,
  createWorld,
  updatePings
} from "./index";
import type { EnemyState, Vec2, WorldState } from "./index";

describe("contextual pings", () => {
  it("prioritizes nearby enemies as danger pings", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    const enemy = addEnemy(world, "e1", {
      x: player.pos.x + 1,
      y: player.pos.y
    });
    damageNearestTile(world, player.pos);
    world.pickups.push({ id: "loot1", kind: "coin", pos: player.pos, value: 1 });

    const ping = createPing(world, player.id);

    expect(ping).toMatchObject({
      kind: "danger",
      x: enemy.pos.x,
      y: enemy.pos.y,
      playerId: player.id,
      ttlTicks: PING_TTL_S * TICK_RATE
    });
    expect(world.pings).toEqual([ping]);
  });

  it("uses damaged tiles as repair pings when no enemy is nearby", () => {
    const world = createWorld(2);
    const player = addPlayer(world, "p1");
    const tile = damageNearestTile(world, player.pos);
    world.pickups.push({ id: "loot1", kind: "coin", pos: player.pos, value: 1 });

    const ping = createPing(world, player.id);

    expect(ping).toMatchObject({
      kind: "repair",
      x: tile.col + 0.5,
      y: tile.row + 0.5
    });
  });

  it("uses nearby pickups as loot pings when no enemy or repair is nearby", () => {
    const world = createWorld(3);
    const player = addPlayer(world, "p1");
    world.pickups.push({
      id: "loot1",
      kind: "salvage",
      pos: { x: player.pos.x + 0.75, y: player.pos.y },
      value: 1
    });

    const ping = createPing(world, player.id);

    expect(ping).toMatchObject({
      kind: "loot",
      x: player.pos.x + 0.75,
      y: player.pos.y
    });
  });

  it("falls back to a group ping at the player position", () => {
    const world = createWorld(4);
    const player = addPlayer(world, "p1");

    const ping = createPing(world, player.id);

    expect(ping).toMatchObject({
      kind: "group",
      x: player.pos.x,
      y: player.pos.y
    });
  });

  it("does not let downed or out players ping", () => {
    const world = createWorld(5);
    const downed = addPlayer(world, "downed");
    const out = addPlayer(world, "out");
    downed.downed = true;
    out.out = true;

    expect(createPing(world, downed.id)).toBeNull();
    expect(createPing(world, out.id)).toBeNull();
    expect(world.pings).toEqual([]);
  });

  it("expires pings after their ttl", () => {
    const world = createWorld(6);
    const player = addPlayer(world, "p1");
    createPing(world, player.id);

    for (let i = 0; i < PING_TTL_S * TICK_RATE; i += 1) {
      updatePings(world);
    }

    expect(world.pings).toEqual([]);
  });
});

function damageNearestTile(world: WorldState, pos: Vec2): WorldState["raft"]["tiles"][number] {
  const tile = world.raft.tiles.find(
    (candidate) =>
      Math.floor(pos.x) === candidate.col && Math.floor(pos.y) === candidate.row
  );
  if (tile === undefined) {
    throw new Error("expected a tile under the player");
  }

  tile.hp = tile.maxHp / 2;
  return tile;
}

function addEnemy(world: WorldState, id: string, pos: Vec2): EnemyState {
  const enemy: EnemyState = {
    id,
    type: "chum",
    pos,
    hp: 18,
    maxHp: 18,
    radius: 0.3,
    speed: 2.6,
    contactDamage: 6,
    contactCooldownTicks: 0,
    contactCooldownMax: Math.round(0.6 * TICK_RATE),
    slowTicks: 0,
    slowFactor: 1,
    attackingTileId: null,
    markTicks: 0
  };

  world.enemies.push(enemy);
  return enemy;
}
