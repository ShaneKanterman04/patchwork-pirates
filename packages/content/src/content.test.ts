import { describe, expect, it } from "vitest";

import { addPlayer, createWorld, tick } from "@patchwork/sim";
import type { PlayerInput } from "@patchwork/sim";

import { CONTENT } from "./index";

describe("content determinism", () => {
  it("replays cutlass and chum simulation deterministically", () => {
    const first = createWorld(99, CONTENT);
    const second = createWorld(99, CONTENT);
    addPlayer(first, "p1", ["cutlass", "harpoon_gun", "coconut_launcher"]);
    addPlayer(second, "p1", ["cutlass", "harpoon_gun", "coconut_launcher"]);

    for (let i = 0; i < 200; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect({
      players: first.players,
      enemies: first.enemies,
      pickups: first.pickups,
      projectiles: first.projectiles
    }).toEqual({
      players: second.players,
      enemies: second.enemies,
      pickups: second.pickups,
      projectiles: second.projectiles
    });
  });
});

function replayInput(tickIndex: number): Map<string, PlayerInput> {
  const movement =
    tickIndex % 4 === 0
      ? { x: 1, y: 0 }
      : tickIndex % 4 === 1
        ? { x: 0, y: 1 }
        : tickIndex % 4 === 2
          ? { x: -1, y: 0 }
          : { x: 0, y: -1 };

  return new Map([
    [
      "p1",
      {
        movement,
        dash: tickIndex === 7 || tickIndex === 93,
        interact: tickIndex % 13 === 0
      }
    ]
  ]);
}
