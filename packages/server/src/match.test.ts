import { describe, expect, it } from "vitest";
import { DOWNED_BLEED_OUT_S, REVIVE_S, TICK_RATE, startRun } from "@patchwork/sim";
import {
  addConnectionToLobby,
  buildSnapshot,
  canStartLobby,
  createMatchEntry,
  createMatch,
  buildLobbyPlayers,
  disconnectRunningConnection,
  handleClientMessage,
  matchAddPlayer,
  matchRemovePlayer,
  reattachDisconnectedConnection,
  rematchEntry,
  removeConnectionFromLobby,
  selectLobbyCharacter,
  setLobbyReady,
  setInput,
  stepMatch
} from "./match";

describe("match", () => {
  it("adds lobby players without a weapon until character select", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");

    expect(playerId).toBe("p1");
    expect(match.world.players).toHaveLength(1);
    expect(match.world.players[0]?.weapons).toEqual([]);
  });

  it("moves a player from latest input and reflects that in snapshots", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");
    startRun(match.world);
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
    expect(player?.weaponIds).toEqual([]);
  });

  it("lists enemy views once the spawner has produced one", () => {
    const match = createMatch(1);
    matchAddPlayer(match, "c1");
    startRun(match.world);

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

  it("exposes boss state and enemy attack telegraphs in snapshots", () => {
    const match = createMatch(1);
    match.world.boss = {
      phase: "tentacles",
      hp: 60,
      maxHp: 100,
      phaseTicksLeft: TICK_RATE,
      headEnemyId: null,
      cycles: 0
    };
    match.world.enemies.push({
      id: "tentacle1",
      type: "kraken_tentacle",
      pos: { x: 0.5, y: -0.2 },
      hp: 35,
      maxHp: 70,
      radius: 0.45,
      speed: 0,
      contactDamage: 0,
      contactCooldownTicks: 0,
      contactCooldownMax: Math.round(2.2 * TICK_RATE),
      slowTicks: 0,
      slowFactor: 1,
      attackingTileId: "2,3",
      telegraphTicks: 13,
      markTicks: 0,
      animState: "windup" as const,
      attackAnimTicks: 0
    });

    const snapshot = buildSnapshot(match);

    expect(snapshot.boss).toEqual({ phase: "tentacles", hpRatio: 0.6 });
    expect(snapshot.enemies[0]).toMatchObject({
      kind: "kraken_tentacle",
      telegraph: {
        col: 2,
        row: 3,
        ratio: 13 / Math.round(0.85 * TICK_RATE)
      }
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
    player!.characterId = "captain";
    player!.downed = true;
    player!.out = false;
    player!.hp = 20;
    player!.bleedOutTicks = (DOWNED_BLEED_OUT_S * TICK_RATE) / 2;
    player!.reviveProgressTicks = (REVIVE_S * TICK_RATE) / 3;
    player!.stats = {
      damageDealt: 42,
      tilesRepaired: 2,
      revives: 1
    };
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
    brokenTile!.patched = true;
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
    match.world.pings.push({
      id: "ping1",
      kind: "repair",
      x: 1.5,
      y: 2.5,
      ttlTicks: TICK_RATE,
      playerId
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
    expect(brokenView).toMatchObject({ broken: true, hpRatio: 0, patched: true });
    expect(coreView?.patched).toBeUndefined();
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
      },
      downed: true,
      out: false,
      bleedOutRatio: 0.5,
      reviveProgressRatio: 1 / 3,
      characterId: "captain",
      stats: {
        damageDealt: 42,
        tilesRepaired: 2,
        revives: 1
      }
    });
    expect(snapshot.salvage).toBe(6);
    expect(snapshot.modules).toEqual([
      { id: "m1", defId: "cannon", col: 1, row: 1, hpRatio: 0.5 }
    ]);
    expect(snapshot.pings).toEqual([
      { id: "ping1", kind: "repair", x: 1.5, y: 2.5 }
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
    player!.weapons = [
      { defId: "cutlass", cooldownTicks: 0 },
      { defId: "harpoon_gun", cooldownTicks: 0 }
    ];
    player!.shop = {
      offers: [{ kind: "weapon", defId: "harpoon_gun", price: 7 }],
      locked: [false],
      rerollCost: 3
    };

    handleClientMessage(match, playerId, { type: "buy", index: 0 });
    handleClientMessage(match, playerId, { type: "sell_weapon", index: 0 });
    handleClientMessage(match, playerId, { type: "ready", ready: true });

    expect(player!.coins).toBe(19);
    expect(player!.weapons.map((weapon) => weapon.defId)).toEqual([
      "harpoon_gun",
      "harpoon_gun"
    ]);
    expect(player!.shop.offers[0]).toEqual({ kind: "sold" });
    expect(match.world.run.readyPlayerIds).toContain(playerId);
  });

  it("routes ping client messages to sim ping creation", () => {
    const match = createMatch(123);
    const playerId = matchAddPlayer(match, "c1");

    handleClientMessage(match, playerId, { type: "ping" });

    expect(match.world.pings).toHaveLength(1);
    expect(match.world.pings[0]).toMatchObject({
      kind: "group",
      playerId
    });
  });

  it("create-style lobby entry gets a code and first player", () => {
    const entry = createMatchEntry("ABCD", 123);
    const playerId = addConnectionToLobby(entry, "c1");

    expect(entry.code).toBe("ABCD");
    expect(playerId).toBe("p1");
    expect(entry.conns.get("c1")).toBe("p1");
    expect(buildLobbyPlayers(entry)).toEqual([
      { id: "p1", characterId: null, ready: false }
    ]);
  });

  it("join-style lobby add creates a second player", () => {
    const entry = createMatchEntry("ABCD", 123);
    addConnectionToLobby(entry, "c1");
    const secondPlayerId = addConnectionToLobby(entry, "c2");

    expect(secondPlayerId).toBe("p2");
    expect(entry.match.world.players.map((player) => player.id)).toEqual([
      "p1",
      "p2"
    ]);
  });

  it("removes a leaving lobby connection from the roster", () => {
    const entry = createMatchEntry("ABCD", 123);
    const playerId = addConnectionToLobby(entry, "c1");
    selectLobbyCharacter(entry, playerId, "captain");
    entry.lobby.ready.add(playerId);

    removeConnectionFromLobby(entry, "c1");

    expect(entry.conns.has("c1")).toBe(false);
    expect(entry.lobby.selections.has(playerId)).toBe(false);
    expect(entry.lobby.ready.has(playerId)).toBe(false);
    expect(entry.match.world.players).toEqual([]);
  });

  it("bad lobby code lookup produces no entry", () => {
    const matches = new Map([["ABCD", createMatchEntry("ABCD", 123)]]);

    expect(matches.get("WXYZ")).toBeUndefined();
  });

  it("all ready and selected starts the run", () => {
    const entry = createMatchEntry("ABCD", 123);
    const p1 = addConnectionToLobby(entry, "c1");
    const p2 = addConnectionToLobby(entry, "c2");

    expect(selectLobbyCharacter(entry, p1, "captain")).toBe(true);
    expect(selectLobbyCharacter(entry, p2, "fisher")).toBe(true);
    setLobbyReady(entry, p1, true);
    expect(entry.match.world.run.phase).toBe("lobby");
    expect(canStartLobby(entry)).toBe(false);

    setLobbyReady(entry, p2, true);

    expect(entry.lobby.started).toBe(true);
    expect(entry.match.world.run.phase).toBe("combat");
    expect(entry.match.world.players.map((player) => player.characterId)).toEqual([
      "captain",
      "fisher"
    ]);
  });

  it("keeps two lobbies isolated", () => {
    const first = createMatchEntry("AAAA", 1);
    const second = createMatchEntry("BBBB", 2);
    const firstPlayer = addConnectionToLobby(first, "c1");
    const secondPlayer = addConnectionToLobby(second, "c2");

    selectLobbyCharacter(first, firstPlayer, "captain");
    selectLobbyCharacter(second, secondPlayer, "fisher");
    setLobbyReady(first, firstPlayer, true);

    expect(first.match.world.run.phase).toBe("combat");
    expect(second.match.world.run.phase).toBe("lobby");
    expect(first.match.world.players).toHaveLength(1);
    expect(second.match.world.players).toHaveLength(1);
    expect(first.match.world.players[0]?.id).toBe("p1");
    expect(second.match.world.players[0]?.id).toBe("p1");
    expect(first.match.world.enemies).toEqual([]);
    expect(second.match.world.enemies).toEqual([]);
  });

  it("disconnecting a running slot marks it disconnected, downs it, and keeps it in the world", () => {
    const entry = createMatchEntry("ABCD", 123);
    const playerId = addConnectionToLobby(entry, "c1");
    selectLobbyCharacter(entry, playerId, "captain");
    setLobbyReady(entry, playerId, true);

    expect(entry.match.world.run.phase).toBe("combat");

    const disconnectedPlayerId = disconnectRunningConnection(entry, "c1");
    const player = entry.match.world.players.find(
      (candidate) => candidate.id === playerId
    );

    expect(disconnectedPlayerId).toBe(playerId);
    expect(entry.conns.has("c1")).toBe(false);
    expect(entry.disconnected.has(playerId)).toBe(true);
    expect(entry.match.world.players.map((candidate) => candidate.id)).toEqual([
      playerId
    ]);
    expect(entry.match.latestInputs.has(playerId)).toBe(false);
    expect(player).toMatchObject({
      downed: true,
      out: false,
      hp: 0,
      bleedOutTicks: DOWNED_BLEED_OUT_S * TICK_RATE,
      reviveProgressTicks: 0
    });
  });

  it("reattaches a disconnected slot and clears the disconnected mark", () => {
    const entry = createMatchEntry("ABCD", 123);
    const playerId = addConnectionToLobby(entry, "c1");
    selectLobbyCharacter(entry, playerId, "captain");
    setLobbyReady(entry, playerId, true);
    disconnectRunningConnection(entry, "c1");

    expect(reattachDisconnectedConnection(entry, "c2", playerId)).toBe(true);
    expect(entry.disconnected.has(playerId)).toBe(false);
    expect(entry.conns.get("c2")).toBe(playerId);
    expect(reattachDisconnectedConnection(entry, "c3", playerId)).toBe(false);
  });

  it("rematches terminal runs with connected players and preserved selections", () => {
    const entry = createMatchEntry("ABCD", 123);
    const p1 = addConnectionToLobby(entry, "c1");
    const p2 = addConnectionToLobby(entry, "c2");
    selectLobbyCharacter(entry, p1, "captain");
    selectLobbyCharacter(entry, p2, "fisher");
    setLobbyReady(entry, p1, true);
    setLobbyReady(entry, p2, true);
    disconnectRunningConnection(entry, "c2");
    entry.match.world.tick = 57;
    entry.match.world.run.phase = "victory";
    entry.lobby.ready.add(p1);
    entry.lobby.ready.add(p2);
    const oldSeed = entry.seed;

    expect(rematchEntry(entry)).toBe(true);

    expect(entry.code).toBe("ABCD");
    expect(entry.seed).not.toBe(oldSeed);
    expect(entry.match.world.rngState).toBe(entry.seed);
    expect(entry.match.world.tick).toBe(0);
    expect(entry.match.world.run).toMatchObject({ wave: 1, phase: "lobby" });
    expect(entry.match.world.players.map((player) => player.id)).toEqual([p1]);
    expect(entry.match.world.players[0]?.characterId).toBe("captain");
    expect(buildLobbyPlayers(entry)).toEqual([
      { id: p1, characterId: "captain", ready: false }
    ]);
    expect(entry.lobby.ready.size).toBe(0);
    expect(entry.lobby.started).toBe(false);
    expect(entry.disconnected.size).toBe(0);

    const firstRematchSeed = entry.seed;
    entry.match.world.run.phase = "defeat";
    expect(rematchEntry(entry)).toBe(true);

    expect(entry.seed).not.toBe(firstRematchSeed);
  });

  it("does not rematch non-terminal runs", () => {
    const entry = createMatchEntry("ABCD", 123);
    const playerId = addConnectionToLobby(entry, "c1");
    selectLobbyCharacter(entry, playerId, "captain");
    setLobbyReady(entry, playerId, true);
    const world = entry.match.world;

    expect(rematchEntry(entry)).toBe(false);
    expect(entry.match.world).toBe(world);
    expect(entry.match.world.run.phase).toBe("combat");
  });
});
