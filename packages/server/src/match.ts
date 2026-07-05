import { CONTENT } from "@patchwork/content";
import {
  TICK_RATE,
  addPlayer,
  buyOffer,
  createWorld,
  purchaseModule,
  rerollShop,
  setPlayerReady,
  tick,
  toggleLock
} from "@patchwork/sim";
import type {
  PlayerId,
  PlayerInput,
  SimEvent,
  ShopOffer,
  WorldState
} from "@patchwork/sim";
import type {
  ClientMessage,
  ShopOfferView,
  ShopView,
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

export function handleClientMessage(
  match: Match,
  playerId: string,
  msg: ClientMessage
): void {
  try {
    switch (msg.type) {
      case "player_input":
        setInput(match, playerId, msg);
        return;
      case "buy":
        buyOffer(match.world, playerId, msg.index);
        return;
      case "reroll":
        rerollShop(match.world, playerId);
        return;
      case "lock":
        toggleLock(match.world, playerId, msg.index);
        return;
      case "ready":
        setPlayerReady(match.world, playerId, msg.ready);
        return;
      case "place_module":
        purchaseModule(match.world, playerId, msg.defId, msg.col, msg.row);
        return;
      default:
        console.warn(
          `dropping unknown client message from ${playerId}: ${JSON.stringify(msg)}`
        );
    }
  } catch (error) {
    console.warn(
      `dropping bad client message from ${playerId}: ${String(error)}`
    );
  }
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
      weaponIds: player.weapons.map((weapon) => weapon.defId),
      coins: player.coins,
      shop: shopToView(player.shop)
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
      y: projectile.pos.y,
      faction: projectile.faction
    })),
    pickups: match.world.pickups.map((pickup) => ({
      id: pickup.id,
      kind: pickup.kind,
      x: pickup.pos.x,
      y: pickup.pos.y
    })),
    wave: {
      number: match.world.run.wave,
      phase: match.world.run.phase,
      timeLeft: Math.round((match.world.run.phaseTicksLeft / TICK_RATE) * 10) / 10
    },
    raft: {
      width: match.world.raft.width,
      height: match.world.raft.height,
      tiles: match.world.raft.tiles.map((tile) => ({
        col: tile.col,
        row: tile.row,
        kind: tile.kind,
        hpRatio: tile.maxHp > 0 ? tile.hp / tile.maxHp : 0,
        broken: tile.broken
      }))
    },
    salvage: match.world.salvage,
    modules: match.world.modules.map((module) => ({
      id: module.id,
      defId: module.defId,
      col: module.col,
      row: module.row,
      hpRatio: module.maxHp > 0 ? module.hp / module.maxHp : 0
    }))
  };
}

function shopToView(shop: { offers: ShopOffer[]; locked: boolean[]; rerollCost: number }): ShopView {
  return {
    offers: shop.offers.map(shopOfferToView),
    locked: [...shop.locked],
    rerollCost: shop.rerollCost
  };
}

function shopOfferToView(offer: ShopOffer): ShopOfferView {
  switch (offer.kind) {
    case "weapon":
      return { kind: "weapon", defId: offer.defId, price: offer.price };
    case "item":
      return { kind: "item", defId: offer.defId, price: offer.price };
    case "sold":
      return { kind: "sold" };
    default: {
      const unhandled: never = offer;
      throw new Error(`unhandled shop offer: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function simEventsToWire(events: SimEvent[]): WireEvent[] {
  return events.map(simEventToWire);
}

function simEventToWire(event: SimEvent): WireEvent {
  switch (event.type) {
    case "weapon_fired":
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
    case "enemy_hit":
      return {
        type: "enemy_hit",
        enemyId: event.enemyId,
        damage: event.damage,
        x: event.pos.x,
        y: event.pos.y
      };
    case "enemy_killed":
      return {
        type: "enemy_killed",
        enemyId: event.enemyId,
        x: event.pos.x,
        y: event.pos.y
      };
    case "explosion":
      return {
        type: "explosion",
        x: event.pos.x,
        y: event.pos.y,
        radius: event.radius
      };
    case "tile_broken":
      return { type: "tile_broken", col: event.col, row: event.row };
    case "tile_repaired":
      return { type: "tile_repaired", col: event.col, row: event.row };
    case "core_destroyed":
      return { type: "core_destroyed" };
    default: {
      // Exhaustiveness guard: a new SimEvent variant fails to compile here
      // until it is explicitly mapped to the wire (or deliberately dropped).
      const unhandled: never = event;
      throw new Error(`unhandled sim event: ${JSON.stringify(unhandled)}`);
    }
  }
}
