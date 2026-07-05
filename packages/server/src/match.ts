import { CONTENT } from "@patchwork/content";
import { addPlayer, createWorld, tick } from "@patchwork/sim";
import type {
  PlayerId,
  PlayerInput,
  SimEvent,
  WorldState
} from "@patchwork/sim";
import type {
  ClientMessage,
  Snapshot,
  WireEvent
} from "@patchwork/protocol";

export interface Match {
  world: WorldState;
  latestInputs: Map<PlayerId, PlayerInput>;
  nextPlayerNumber: number;
}

export type PlayerInputMessage = ClientMessage & { type: "player_input" };

export function createMatch(seed: number): Match {
  return {
    world: createWorld(seed, CONTENT),
    latestInputs: new Map(),
    nextPlayerNumber: 1
  };
}

export function matchAddPlayer(match: Match, connId: string): string {
  void connId;

  const playerId = `p${match.nextPlayerNumber}`;
  match.nextPlayerNumber += 1;
  addPlayer(match.world, playerId, ["cutlass"]);
  return playerId;
}

export function matchRemovePlayer(match: Match, playerId: string): void {
  match.world.players = match.world.players.filter(
    (player) => player.id !== playerId
  );
  match.latestInputs.delete(playerId);
}

export function setInput(
  match: Match,
  playerId: string,
  input: PlayerInputMessage
): void {
  match.latestInputs.set(playerId, {
    movement: { x: input.movement.x, y: input.movement.y },
    dash: input.dash,
    interact: input.interact
  });
}

export function stepMatch(match: Match): SimEvent[] {
  const inputs = new Map<PlayerId, PlayerInput>();

  for (const player of match.world.players) {
    const input = match.latestInputs.get(player.id);

    if (input !== undefined) {
      inputs.set(player.id, input);
    }
  }

  tick(match.world, inputs);
  return match.world.events.map((event) => ({ ...event }));
}

export function buildSnapshot(match: Match): Snapshot {
  return {
    tick: match.world.tick,
    players: match.world.players.map((player) => ({
      id: player.id,
      x: player.pos.x,
      y: player.pos.y,
      hp: player.hp,
      maxHp: player.maxHp,
      facingX: player.facing.x,
      facingY: player.facing.y,
      downed: player.hp <= 0,
      weaponIds: player.weapons.map((weapon) => weapon.defId)
    })),
    enemies: match.world.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.type,
      x: enemy.pos.x,
      y: enemy.pos.y,
      hpRatio: enemy.maxHp === 0 ? 0 : enemy.hp / enemy.maxHp,
      radius: enemy.radius
    })),
    projectiles: match.world.projectiles.map((projectile) => ({
      id: projectile.id,
      kind: projectile.type,
      x: projectile.pos.x,
      y: projectile.pos.y
    })),
    pickups: match.world.pickups.map((pickup) => ({
      id: pickup.id,
      kind: pickup.kind,
      x: pickup.pos.x,
      y: pickup.pos.y
    })),
    wave: { number: 1, phase: "combat", timeLeft: 0 }
  };
}

export function simEventsToWire(events: SimEvent[]): WireEvent[] {
  return events.map((event) => {
    if (event.type === "weapon_fired") {
      return {
        type: "weapon_fired",
        wielderId: event.wielderId,
        weaponId: event.weaponId,
        ox: event.origin.x,
        oy: event.origin.y,
        dx: event.dir.x,
        dy: event.dir.y,
        arcDegrees: event.arcDegrees,
        range: event.range
      };
    }

    if (event.type === "enemy_hit") {
      return {
        type: "enemy_hit",
        enemyId: event.enemyId,
        damage: event.damage,
        x: event.pos.x,
        y: event.pos.y
      };
    }

    return {
      type: "enemy_killed",
      enemyId: event.enemyId,
      x: event.pos.x,
      y: event.pos.y
    };
  });
}
