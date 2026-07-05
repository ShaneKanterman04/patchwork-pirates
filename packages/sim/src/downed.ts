import {
  DOWNED_BLEED_OUT_S,
  REVIVE_HP_FRACTION,
  REVIVE_RANGE,
  REVIVE_S,
  TICK_RATE
} from "./constants";
import { clampToRaft } from "./player";
import type { PlayerInput, PlayerState, Vec2, WorldState } from "./types";

export function forceDowned(world: WorldState, playerId: string): boolean {
  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || player.downed || player.out) {
    return false;
  }

  player.downed = true;
  player.hp = 0;
  player.bleedOutTicks = DOWNED_BLEED_OUT_S * TICK_RATE;
  player.reviveProgressTicks = 0;
  return true;
}

export function updateDowned(
  world: WorldState,
  inputs: Map<string, PlayerInput>
): void {
  const tookHit = new Set<string>();

  for (const player of world.players) {
    if (player.hp < player.prevHp) {
      tookHit.add(player.id);
    }
  }

  for (const player of world.players) {
    if (!player.downed && !player.out && player.hp <= 0) {
      player.downed = true;
      player.hp = 0;
      player.bleedOutTicks = DOWNED_BLEED_OUT_S * TICK_RATE;
      player.reviveProgressTicks = 0;
    }
  }

  for (const downedPlayer of world.players) {
    if (!downedPlayer.downed) {
      continue;
    }

    const reviver = findEligibleReviver(world, downedPlayer, inputs, tookHit);
    if (reviver !== null) {
      downedPlayer.reviveProgressTicks += 1;
      if (downedPlayer.reviveProgressTicks >= REVIVE_S * TICK_RATE) {
        revivePlayer(downedPlayer);
        reviver.stats.revives += 1;
      }
    } else {
      downedPlayer.reviveProgressTicks = 0;
    }
  }

  for (const player of world.players) {
    if (!player.downed) {
      continue;
    }

    player.bleedOutTicks -= 1;
    if (player.bleedOutTicks <= 0) {
      player.out = true;
      player.downed = false;
      player.bleedOutTicks = 0;
      player.reviveProgressTicks = 0;
    }
  }

  for (const player of world.players) {
    player.prevHp = player.hp;
  }
}

export function returnDownedAndOutPlayers(world: WorldState): void {
  for (const player of world.players) {
    if (!player.downed && !player.out) {
      continue;
    }

    revivePlayer(player);
    player.out = false;
    player.pos = safeReturnPosition(world, player);
  }
}

export function hasDownedPlayerInReviveRange(
  world: WorldState,
  reviver: PlayerState
): boolean {
  return world.players.some(
    (player) =>
      player !== reviver &&
      player.downed &&
      distance(player.pos, reviver.pos) <= REVIVE_RANGE
  );
}

function findEligibleReviver(
  world: WorldState,
  downedPlayer: PlayerState,
  inputs: Map<string, PlayerInput>,
  tookHit: Set<string>
): PlayerState | null {
  for (const reviver of world.players) {
    if (reviver === downedPlayer || reviver.downed || reviver.out) {
      continue;
    }

    const input = inputs.get(reviver.id);
    if (input?.interact !== true || tookHit.has(reviver.id)) {
      continue;
    }

    if (distance(reviver.pos, downedPlayer.pos) <= REVIVE_RANGE) {
      return reviver;
    }
  }

  return null;
}

function revivePlayer(player: PlayerState): void {
  player.downed = false;
  player.hp = Math.round(player.maxHp * REVIVE_HP_FRACTION);
  player.bleedOutTicks = 0;
  player.reviveProgressTicks = 0;
}

function safeReturnPosition(world: WorldState, player: PlayerState): Vec2 {
  const base = clampToRaft({
    x: world.raft.width / 2,
    y: world.raft.height / 2
  });
  const index = world.players.indexOf(player);
  const offsets = [
    { x: 0, y: 0 },
    { x: 0.35, y: 0 },
    { x: -0.35, y: 0 },
    { x: 0, y: 0.35 },
    { x: 0, y: -0.35 }
  ];
  const offset = offsets[index % offsets.length] as Vec2;

  return clampToRaft({
    x: base.x + offset.x,
    y: base.y + offset.y
  });
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
