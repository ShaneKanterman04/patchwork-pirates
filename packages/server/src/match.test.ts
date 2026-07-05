import { describe, expect, it } from "vitest";
import { TICK_RATE } from "@patchwork/sim";
import {
  buildSnapshot,
  createMatch,
  handleClientMessage,
  matchAddPlayer,
  matchRemovePlayer,
  setInput,
  stepMatch
} from "./match";

describe("match", () => {
  it("adds players with a cutlass", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");

    expect(playerId).toBe("p1");
    expect(match.world.players).toHaveLength(1);
    expect(match.world.players[0]?.weapons.map((weapon) => weapon.defId)).toEqual([
      "cutlass"
    ]);
  });

  it("moves a player from latest input and reflects that in snapshots", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");
    const beforeX = buildSnapshot(match).players[0]?.x;

    setInput(match, playerId, {
      type: "player_input",
      seq: 1,
      movement: { x: 1, y: 0 },
      dash: false,
      interact: false
    });

    for (let i = 0; i < 5; i += 1) {
      stepMatch(match);
    }

    const snapshot = buildSnapshot(match);
    const player = snapshot.players[0];

    expect(player).toBeDefined();
    expect(player?.x).toBeGreaterThan(beforeX ?? 0);
    expect(player?.weaponIds).toEqual(["cutlass"]);
  });

  it("lists enemy views once the spawner has produced one", () => {
    const match = createMatch(1);
    matchAddPlayer(match, "c1");

    for (let i = 0; i < 15; i += 1) {
      stepMatch(match);
    }

    const snapshot = buildSnapshot(match);

    expect(snapshot.enemies.length).toBeGreaterThan(0);
    expect(snapshot.enemies[0]).toMatchObject({
      kind: "chum",
      hpRatio: 1,
      radius: 0.3
    });
  });

  it("removes players from the world and snapshots", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");

    setInput(match, playerId, {
      type: "player_input",
      seq: 1,
      movement: { x: 1, y: 0 },
      dash: false,
      interact: false
    });
    matchRemovePlayer(match, playerId);

    expect(match.latestInputs.has(playerId)).toBe(false);
    expect(buildSnapshot(match).players).toEqual([]);
  });

  it("exposes phase-1 sim state in snapshots", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");
    const player = match.world.players.find((candidate) => candidate.id === playerId);
    const coreTile = match.world.raft.tiles.find((tile) => tile.kind === "core");
    const brokenTile = match.world.raft.tiles.find((tile) => tile.kind === "deck");

    expect(player).toBeDefined();
    expect(coreTile).toBeDefined();
    expect(brokenTile).toBeDefined();

    player!.coins = 17;
    player!.shop = {
      offers: [
        { kind: "weapon", defId: "harpoon_gun", price: 9 },
        { kind: "item", defId: "sharp_cutlass", price: 5 },
        { kind: "sold" }
      ],
      locked: [true, false, false],
      rerollCost: 4
    };
    coreTile!.hp = coreTile!.maxHp / 2;
    brokenTile!.hp = 0;
    brokenTile!.broken = true;
    match.world.salvage = 6;
    match.world.modules.push({
      id: "m1",
      defId: "cannon",
      col: 1,
      row: 1,
      hp: 25,
      maxHp: 50,
      cooldownTicks: 0
    });
    match.world.run.phase = "build";
    match.world.run.wave = 2;
    match.world.run.phaseTicksLeft = Math.round(1.5 * TICK_RATE);

    const snapshot = buildSnapshot(match);
    const playerView = snapshot.players.find((candidate) => candidate.id === playerId);
    const coreView = snapshot.raft?.tiles.find((tile) => tile.kind === "core");
    const brokenView = snapshot.raft?.tiles.find(
      (tile) => tile.col === brokenTile!.col && tile.row === brokenTile!.row
    );

    expect(snapshot.raft).toMatchObject({
      width: match.world.raft.width,
      height: match.world.raft.height
    });
    expect(brokenView).toMatchObject({ broken: true, hpRatio: 0 });
    expect(coreView?.hpRatio).toBe(0.5);
    expect(playerView).toMatchObject({
      coins: 17,
      shop: {
        offers: [
          { kind: "weapon", defId: "harpoon_gun", price: 9 },
          { kind: "item", defId: "sharp_cutlass", price: 5 },
          { kind: "sold" }
        ],
        locked: [true, false, false],
        rerollCost: 4
      }
    });
    expect(snapshot.salvage).toBe(6);
    expect(snapshot.modules).toEqual([
      { id: "m1", defId: "cannon", col: 1, row: 1, hpRatio: 0.5 }
    ]);
    expect(snapshot.wave).toEqual({ number: 2, phase: "build", timeLeft: 1.5 });
  });

  it("routes build phase client messages to sim transactions", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");
    const player = match.world.players.find((candidate) => candidate.id === playerId);

    expect(player).toBeDefined();

    match.world.run.phase = "build";
    player!.coins = 20;
    player!.shop = {
      offers: [{ kind: "weapon", defId: "harpoon_gun", price: 7 }],
      locked: [false],
      rerollCost: 3
    };

    handleClientMessage(match, playerId, { type: "buy", index: 0 });
    handleClientMessage(match, playerId, { type: "ready", ready: true });

    expect(player!.coins).toBe(13);
    expect(player!.shop.offers[0]).toEqual({ kind: "sold" });
    expect(match.world.run.readyPlayerIds).toContain(playerId);
  });
});
