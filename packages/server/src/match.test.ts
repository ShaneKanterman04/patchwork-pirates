import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  createMatch,
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
});
