import {
  DASH_COOLDOWN_TICKS,
  DASH_DURATION_TICKS,
  DASH_SPEED_MULT,
  TICK_RATE
} from "./constants";
import {
  clampMovement,
  clampToRaft,
  normalizeOrZero
} from "./player";
import { createRaft } from "./raft";
import type { PlayerId, PlayerInput, Vec2, WorldState } from "./types";

const ZERO_INPUT: PlayerInput = {
  movement: { x: 0, y: 0 },
  dash: false,
  interact: false
};

const FACING_EPSILON = 0.000001;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = nextMulberry32State(state);
    return stateToUnitFloat(scrambleMulberry32State(state));
  };
}

export function nextRandom(world: WorldState): number {
  world.rngState = nextMulberry32State(world.rngState);
  return stateToUnitFloat(scrambleMulberry32State(world.rngState));
}

export function createWorld(seed: number): WorldState {
  return {
    tick: 0,
    rngState: seed >>> 0,
    players: [],
    raft: createRaft()
  };
}

export function tick(
  world: WorldState,
  inputs: Map<PlayerId, PlayerInput>
): WorldState {
  for (const player of world.players) {
    const input = inputs.get(player.id) ?? ZERO_INPUT;
    const movement = clampMovement(input.movement);
    const movementDirection = normalizeOrZero(movement);
    const movementMagnitudeSquared =
      movement.x * movement.x + movement.y * movement.y;

    if (movementMagnitudeSquared > FACING_EPSILON * FACING_EPSILON) {
      player.facing = movementDirection;
    }

    if (input.dash && !player.prevDash && player.dashCooldown === 0) {
      player.dashTicks = DASH_DURATION_TICKS;
      player.dashCooldown = DASH_COOLDOWN_TICKS;
      player.dashDir = { ...player.facing };
    }

    const isDashing = player.dashTicks > 0;
    const speed =
      player.moveSpeed * (isDashing ? DASH_SPEED_MULT : 1) / TICK_RATE;
    const direction = isDashing ? player.dashDir : movement;
    const nextPos: Vec2 = {
      x: player.pos.x + direction.x * speed,
      y: player.pos.y + direction.y * speed
    };

    player.pos = clampToRaft(nextPos);
    player.dashTicks = Math.max(0, player.dashTicks - 1);
    player.dashCooldown = Math.max(0, player.dashCooldown - 1);
    player.prevDash = input.dash;
  }

  world.tick += 1;
  return world;
}

function nextMulberry32State(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

function scrambleMulberry32State(state: number): number {
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function stateToUnitFloat(state: number): number {
  return state / 4294967296;
}
