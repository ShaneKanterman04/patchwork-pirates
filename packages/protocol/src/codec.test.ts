import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage
} from "./index";
import type { ClientMessage, ServerMessage, Snapshot } from "./index";

const snapshot: Snapshot = {
  tick: 42,
  players: [
    {
      id: "p1",
      x: 1,
      y: 2,
      hp: 90,
      maxHp: 100,
      facingX: 1,
      facingY: 0,
      downed: false,
      out: false,
      bleedOutRatio: 0,
      reviveProgressRatio: 0.5,
      characterId: "captain",
      weaponIds: ["cutlass"],
      coins: 12,
      shop: {
        offers: [
          { kind: "weapon", defId: "harpoon", price: 8 },
          { kind: "item", defId: "boots", price: 6 },
          { kind: "sold" }
        ],
        locked: [true, false, false],
        rerollCost: 3
      },
      stats: { damageDealt: 18, tilesRepaired: 1, revives: 0 }
    }
  ],
  enemies: [
    {
      id: "e1",
      kind: "kraken_tentacle",
      x: 4,
      y: 5,
      hpRatio: 0.5,
      radius: 0.45,
      telegraph: { col: 2, row: 3, ratio: 0.75 }
    }
  ],
  projectiles: [{ id: "pr1", kind: "glob", x: 4, y: 4, faction: "enemy" }],
  pickups: [{ id: "c1", kind: "coin", x: 3, y: 3 }],
  wave: { number: 2, phase: "build", timeLeft: 14.5 },
  raft: {
    width: 3,
    height: 2,
    tiles: [
      { col: 0, row: 0, kind: "deck", hpRatio: 1, broken: false },
      { col: 1, row: 0, kind: "core", hpRatio: 0.75, broken: false }
    ]
  },
  salvage: 5,
  supplyCap: 20,
  modules: [{ id: "m1", defId: "cannon", col: 2, row: 1, hpRatio: 0.5 }],
  pings: [{ id: "ping1", kind: "danger", x: 4, y: 5 }],
  hazards: [{ id: "h1", kind: "puddle", x: 1.25, y: 2.5, radius: 0.8 }],
  boss: { phase: "tentacles", hpRatio: 0.6 }
};

describe("protocol codec", () => {
  it("round-trips welcome messages", () => {
    const msg: ServerMessage = {
      type: "welcome",
      playerId: "p1",
      protocolVersion: PROTOCOL_VERSION,
      snapshot
    };

    expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
  });

  it("round-trips snapshot messages", () => {
    const msg: ServerMessage = { type: "snapshot", snapshot };

    expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
  });

  it("round-trips events messages", () => {
    const msg: ServerMessage = {
      type: "events",
      tick: 43,
      events: [
        {
          type: "weapon_fired",
          wielderId: "p1",
          weaponId: "cutlass",
          ox: 1,
          oy: 2,
          dx: 1,
          dy: 0,
          arcDegrees: 90,
          range: 1.4
        },
        { type: "enemy_hit", enemyId: "e1", damage: 18, x: 4, y: 5 },
        { type: "enemy_killed", enemyId: "e1", x: 4, y: 5 },
        { type: "trap_triggered", x: 1, y: 2 }
      ]
    };

    expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
  });

  it("round-trips player input messages", () => {
    const msg: ClientMessage = {
      type: "player_input",
      seq: 7,
      movement: { x: 1, y: 0 },
      dash: false,
      interact: false
    };

    expect(decodeClientMessage(encodeClientMessage(msg))).toEqual(msg);
  });

  it("round-trips build phase client messages", () => {
    const messages: ClientMessage[] = [
      { type: "buy", index: 1 },
      { type: "sell_weapon", index: 0 },
      { type: "reroll" },
      { type: "lock", index: 2 },
      { type: "ready", ready: true },
      { type: "place_module", defId: "cannon", col: 1, row: 2 },
      { type: "build_tile", col: -1, row: 2 },
      { type: "ping" }
    ];

    for (const msg of messages) {
      expect(decodeClientMessage(encodeClientMessage(msg))).toEqual(msg);
    }
  });

  it("round-trips lobby client messages", () => {
    const messages: ClientMessage[] = [
      { type: "create" },
      { type: "join", code: "ABCD" },
      { type: "rejoin", code: "ABCD", playerId: "p1" },
      { type: "select", characterId: "captain" },
      { type: "lobby_ready", ready: true }
    ];

    for (const msg of messages) {
      expect(decodeClientMessage(encodeClientMessage(msg))).toEqual(msg);
    }
  });

  it("round-trips lobby server messages", () => {
    const messages: ServerMessage[] = [
      { type: "lobby_joined", code: "ABCD", playerId: "p1" },
      { type: "lobby_error", message: "Lobby not found." },
      {
        type: "lobby_state",
        code: "ABCD",
        players: [{ id: "p1", characterId: "captain", ready: true }],
        canStart: true
      }
    ];

    for (const msg of messages) {
      expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
    }
  });

  it("throws on unknown server message type", () => {
    expect(() => decodeServerMessage('{"type":"wat"}')).toThrow(
      "Unknown server message type"
    );
  });

  it("throws on unknown client message type", () => {
    expect(() => decodeClientMessage('{"type":"wat"}')).toThrow(
      "Unknown client message type"
    );
  });

  it("rejects invalid build_tile coordinates", () => {
    expect(() =>
      decodeClientMessage('{"type":"build_tile","col":"x","row":2}')
    ).toThrow("Invalid build_tile coordinates");
    expect(() =>
      decodeClientMessage('{"type":"build_tile","col":1,"row":null}')
    ).toThrow("Invalid build_tile coordinates");
  });

  it("rejects invalid sell_weapon indexes", () => {
    expect(() =>
      decodeClientMessage('{"type":"sell_weapon","index":-1}')
    ).toThrow("Invalid sell_weapon index");
    expect(() =>
      decodeClientMessage('{"type":"sell_weapon","index":1.5}')
    ).toThrow("Invalid sell_weapon index");
  });
});
