import { describe, expect, it } from "vitest";

import {
  DASH_COOLDOWN_TICKS,
  DASH_DURATION_TICKS,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  RAFT_HEIGHT,
  RAFT_WIDTH,
  TICK_RATE,
  addPlayer,
  createWorld,
  mulberry32,
  nextRandom,
  tick
} from "./index";
import type { PlayerInput, WorldState } from "./index";

const IDLE_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

describe("world tick", () => {
  it("moves players by per-tick speed and clamps at the raft edge", () => {
    const world = createWorld(1);
    const player = addPlayer(world, "p1");
    const input = new Map([
      ["p1", { movement: { x: 1, y: 0 }, dash: false, interact: false }]
    ]);

    const startX = player.pos.x;
    tick(world, input);

    expect(player.pos.x - startX).toBeCloseTo(PLAYER_MOVE_SPEED / TICK_RATE);
    expect(player.pos.y).toBe(1.5);

    for (let i = 1; i < TICK_RATE; i += 1) {
      tick(world, input);
    }

    expect(player.pos.x).toBe(RAFT_WIDTH - PLAYER_RADIUS);
    expect(player.pos.x).toBeLessThanOrEqual(RAFT_WIDTH - PLAYER_RADIUS);
  });

  it("normalizes raw diagonal movement so speed never exceeds baseline", () => {
    const world = createWorld(2);
    const player = addPlayer(world, "p1");
    const input = new Map([
      ["p1", { movement: { x: 1, y: 1 }, dash: false, interact: false }]
    ]);
    const start = { ...player.pos };

    tick(world, input);

    const dx = player.pos.x - start.x;
    const dy = player.pos.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    expect(distance).toBeCloseTo(PLAYER_MOVE_SPEED / TICK_RATE);
  });

  it("keeps players inside the raft when movement is sustained into walls", () => {
    const world = createWorld(3);
    const player = addPlayer(world, "p1");
    const input = new Map([
      ["p1", { movement: { x: -1, y: -1 }, dash: false, interact: false }]
    ]);

    for (let i = 0; i < 100; i += 1) {
      tick(world, input);
    }

    expect(player.pos.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(player.pos.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(player.pos.x).toBeLessThanOrEqual(RAFT_WIDTH - PLAYER_RADIUS);
    expect(player.pos.y).toBeLessThanOrEqual(RAFT_HEIGHT - PLAYER_RADIUS);
  });

  it("starts dash on rising edge, locks direction, and respects cooldown", () => {
    const world = createWorld(4);
    const player = addPlayer(world, "p1");
    const dashEast = new Map([
      ["p1", { movement: { x: 1, y: 0 }, dash: true, interact: false }]
    ]);
    const holdDashSouth = new Map([
      ["p1", { movement: { x: 0, y: 1 }, dash: true, interact: false }]
    ]);

    const start = { ...player.pos };
    tick(world, dashEast);

    expect(player.dashTicks).toBe(DASH_DURATION_TICKS - 1);
    expect(player.dashCooldown).toBe(DASH_COOLDOWN_TICKS - 1);
    expect(player.pos.x - start.x).toBeCloseTo(
      (PLAYER_MOVE_SPEED * 3) / TICK_RATE
    );
    expect(player.pos.y).toBe(start.y);

    for (let i = 1; i < DASH_DURATION_TICKS; i += 1) {
      tick(world, holdDashSouth);
    }

    expect(player.dashTicks).toBe(0);
    expect(player.pos.x - start.x).toBeCloseTo(
      (PLAYER_MOVE_SPEED * 3 * DASH_DURATION_TICKS) / TICK_RATE
    );
    expect(player.pos.y).toBe(start.y);

    tick(world, new Map([["p1", { ...IDLE_INPUT, dash: false }]]));
    const beforeBlockedDash = { ...player.pos };
    tick(world, dashEast);

    expect(player.dashTicks).toBe(0);
    expect(player.pos.x - beforeBlockedDash.x).toBeCloseTo(
      PLAYER_MOVE_SPEED / TICK_RATE
    );

    while (player.dashCooldown > 0) {
      tick(world, new Map([["p1", { ...IDLE_INPUT, dash: false }]]));
    }

    tick(world, dashEast);
    expect(player.dashTicks).toBe(DASH_DURATION_TICKS - 1);
  });

  it("updates facing to the last non-zero movement direction", () => {
    const world = createWorld(5);
    const player = addPlayer(world, "p1");

    tick(
      world,
      new Map([
        ["p1", { movement: { x: 1, y: 0 }, dash: false, interact: false }]
      ])
    );
    expect(player.facing).toEqual({ x: 1, y: 0 });

    tick(world, new Map([["p1", IDLE_INPUT]]));
    expect(player.facing).toEqual({ x: 1, y: 0 });
  });

  it("replays identical input sequences deterministically", () => {
    const first = createReplayWorld();
    const second = createReplayWorld();

    for (let i = 0; i < 100; i += 1) {
      const input = replayInput(i);
      tick(first, input);
      tick(second, input);
    }

    expect(first.players).toEqual(second.players);
  });

  it("creates the static 5x5 raft with a center core", () => {
    const world = createWorld(6);

    expect(world.raft.width).toBe(RAFT_WIDTH);
    expect(world.raft.height).toBe(RAFT_HEIGHT);
    expect(world.raft.tiles).toHaveLength(RAFT_WIDTH * RAFT_HEIGHT);
    expect(world.raft.tiles.filter((tile) => tile.kind === "core")).toEqual([
      {
        col: 2,
        row: 2,
        hp: 10,
        maxHp: 10,
        kind: "core",
        broken: false
      }
    ]);
  });

  it("advances world rng state with the same sequence as mulberry32", () => {
    const world = createWorld(1234);
    const random = mulberry32(1234);

    expect([nextRandom(world), nextRandom(world), nextRandom(world)]).toEqual([
      random(),
      random(),
      random()
    ]);
  });
});

function createReplayWorld(): WorldState {
  const world = createWorld(1234);
  addPlayer(world, "p1");
  return world;
}

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
        dash: tickIndex === 3 || tickIndex === 96,
        interact: tickIndex % 10 === 0
      }
    ]
  ]);
}
