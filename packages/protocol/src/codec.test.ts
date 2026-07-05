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
      weaponIds: ["cutlass"]
    }
  ],
  enemies: [{ id: "e1", kind: "chum", x: 4, y: 5, hpRatio: 0.5, radius: 0.3 }],
  projectiles: [],
  pickups: [{ id: "c1", kind: "coin", x: 3, y: 3 }],
  wave: { number: 1, phase: "combat", timeLeft: 0 }
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
        { type: "enemy_killed", enemyId: "e1", x: 4, y: 5 }
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
});
