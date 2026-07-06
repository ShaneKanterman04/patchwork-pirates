import { CONTENT } from "@patchwork/content";
import {
  DOWNED_BLEED_OUT_S,
  REVIVE_S,
  TICK_RATE,
  addPlayer,
  buildTile,
  buyOffer,
  createPing,
  createWorld,
  forceDowned,
  purchaseModule,
  rerollShop,
  setCharacter,
  setPlayerReady,
  sellWeapon,
  startRun,
  supplyCapacity,
  tick,
  toggleLock
} from "@patchwork/sim";
import type {
  PlayerId,
  PlayerInput,
  SimEvent,
  ShopOffer,
  EnemyState,
  WorldState
} from "@patchwork/sim";
import type {
  ClientMessage,
  LobbyPlayer,
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

export interface MatchEntry {
  code: string;
  baseSeed: number;
  rematchCount: number;
  seed: number;
  match: Match;
  lobby: {
    selections: Map<PlayerId, string>;
    ready: Set<PlayerId>;
    started: boolean;
  };
  conns: Map<string, PlayerId>;
  disconnected: Set<PlayerId>;
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
  addPlayer(match.world, playerId);
  return playerId;
}

export function matchRemovePlayer(match: Match, playerId: string): void {
  match.world.players = match.world.players.filter(
    (player) => player.id !== playerId
  );
  match.latestInputs.delete(playerId);
}

export function createMatchEntry(code: string, seed: number): MatchEntry {
  return {
    code,
    baseSeed: seed >>> 0,
    rematchCount: 0,
    seed: seed >>> 0,
    match: createMatch(seed),
    lobby: {
      selections: new Map(),
      ready: new Set(),
      started: false
    },
    conns: new Map(),
    disconnected: new Set()
  };
}

export function rematchEntry(entry: MatchEntry): boolean {
  if (entry.match.world.run.phase !== "victory" && entry.match.world.run.phase !== "defeat") {
    return false;
  }

  const selections = new Map(entry.lobby.selections);
  const connectedPlayerIds = [...entry.conns.values()];

  entry.rematchCount += 1;
  entry.seed = (entry.baseSeed + entry.rematchCount) >>> 0;
  entry.match = createMatch(entry.seed);
  entry.disconnected.clear();
  entry.lobby.selections.clear();
  entry.lobby.ready.clear();
  entry.lobby.started = false;

  let nextPlayerNumber = 1;
  for (const playerId of connectedPlayerIds) {
    addPlayer(entry.match.world, playerId);
    const selection = selections.get(playerId);

    if (selection !== undefined && setCharacter(entry.match.world, playerId, selection)) {
      entry.lobby.selections.set(playerId, selection);
    }

    const numericId = Number(playerId.slice(1));
    if (playerId.startsWith("p") && Number.isInteger(numericId)) {
      nextPlayerNumber = Math.max(nextPlayerNumber, numericId + 1);
    }
  }

  entry.match.nextPlayerNumber = nextPlayerNumber;
  return true;
}

export function addConnectionToLobby(entry: MatchEntry, connId: string): string {
  const playerId = matchAddPlayer(entry.match, connId);
  entry.conns.set(connId, playerId);
  return playerId;
}

export function removeConnectionFromLobby(
  entry: MatchEntry,
  connId: string
): void {
  const playerId = entry.conns.get(connId);
  if (playerId === undefined) {
    return;
  }

  entry.conns.delete(connId);
  entry.disconnected.delete(playerId);
  entry.lobby.selections.delete(playerId);
  entry.lobby.ready.delete(playerId);
  matchRemovePlayer(entry.match, playerId);
}

export function disconnectRunningConnection(
  entry: MatchEntry,
  connId: string
): string | null {
  const playerId = entry.conns.get(connId);
  if (playerId === undefined) {
    return null;
  }

  entry.conns.delete(connId);
  entry.disconnected.add(playerId);
  entry.match.latestInputs.delete(playerId);
  forceDowned(entry.match.world, playerId);
  return playerId;
}

export function reattachDisconnectedConnection(
  entry: MatchEntry,
  connId: string,
  playerId: string
): boolean {
  if (!entry.disconnected.has(playerId) || !entryHasPlayer(entry, playerId)) {
    return false;
  }

  entry.disconnected.delete(playerId);
  entry.conns.set(connId, playerId);
  return true;
}

export function selectLobbyCharacter(
  entry: MatchEntry,
  playerId: string,
  characterId: string
): boolean {
  if (entry.lobby.started) {
    return false;
  }

  const selected = setCharacter(entry.match.world, playerId, characterId);
  if (!selected) {
    return false;
  }

  entry.lobby.selections.set(playerId, characterId);
  entry.lobby.ready.delete(playerId);
  return true;
}

export function setLobbyReady(
  entry: MatchEntry,
  playerId: string,
  ready: boolean
): void {
  if (entry.lobby.started || !entryHasPlayer(entry, playerId)) {
    return;
  }

  if (ready) {
    entry.lobby.ready.add(playerId);
  } else {
    entry.lobby.ready.delete(playerId);
  }

  maybeStartLobby(entry);
}

export function buildLobbyPlayers(entry: MatchEntry): LobbyPlayer[] {
  return entry.match.world.players.map((player) => ({
    id: player.id,
    characterId: entry.lobby.selections.get(player.id) ?? player.characterId,
    ready: entry.lobby.ready.has(player.id)
  }));
}

export function canStartLobby(entry: MatchEntry): boolean {
  return lobbyReadyToStart(entry);
}

function entryHasPlayer(entry: MatchEntry, playerId: string): boolean {
  return entry.match.world.players.some((player) => player.id === playerId);
}

function maybeStartLobby(entry: MatchEntry): void {
  if (!lobbyReadyToStart(entry)) {
    return;
  }

  startRun(entry.match.world);
  entry.lobby.started = true;
}

function lobbyReadyToStart(entry: MatchEntry): boolean {
  return (
    !entry.lobby.started &&
    entry.match.world.players.length > 0 &&
    entry.match.world.players.every(
      (player) =>
        entry.lobby.ready.has(player.id) &&
        entry.lobby.selections.has(player.id)
    )
  );
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
      case "sell_weapon":
        sellWeapon(match.world, playerId, msg.index);
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
      case "build_tile":
        buildTile(match.world, msg.col, msg.row);
        return;
      case "ping":
        createPing(match.world, playerId);
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
      downed: player.downed,
      out: player.out,
      bleedOutRatio: ratio(
        player.bleedOutTicks,
        DOWNED_BLEED_OUT_S * TICK_RATE
      ),
      reviveProgressRatio: ratio(
        player.reviveProgressTicks,
        REVIVE_S * TICK_RATE
      ),
      characterId: player.characterId,
      weaponIds: player.weapons.map((weapon) => weapon.defId),
      coins: player.coins,
      shop: shopToView(player.shop),
      stats: { ...player.stats }
    })),
    enemies: match.world.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.type,
      anim: enemy.animState,
      x: enemy.pos.x,
      y: enemy.pos.y,
      hpRatio: enemy.maxHp === 0 ? 0 : enemy.hp / enemy.maxHp,
      radius: enemy.radius,
      ...telegraphView(match.world, enemy)
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
    supplyCap: supplyCapacity(match.world),
    modules: match.world.modules.map((module) => ({
      id: module.id,
      defId: module.defId,
      col: module.col,
      row: module.row,
      hpRatio: module.maxHp > 0 ? module.hp / module.maxHp : 0
    })),
    pings: match.world.pings.map((ping) => ({
      id: ping.id,
      kind: ping.kind,
      x: ping.x,
      y: ping.y
    })),
    hazards: match.world.hazards.map((hazard) => ({
      id: hazard.id,
      kind: hazard.kind,
      x: roundViewNumber(hazard.pos.x),
      y: roundViewNumber(hazard.pos.y),
      radius: roundViewNumber(hazard.radius)
    })),
    boss:
      match.world.boss === null
        ? null
        : {
            phase: match.world.boss.phase,
            hpRatio:
              match.world.boss.maxHp > 0
                ? match.world.boss.hp / match.world.boss.maxHp
                : 0
          }
  };
}

function telegraphView(
  world: WorldState,
  enemy: EnemyState
): { telegraph: { col: number; row: number; ratio: number } } | Record<string, never> {
  if (enemy.telegraphTicks <= 0 || enemy.attackingTileId === null) {
    return {};
  }

  const tile = parseTileId(enemy.attackingTileId);
  const totalTicks = telegraphTotalTicks(world, enemy);

  if (tile === null || totalTicks <= 0) {
    return {};
  }

  return {
    telegraph: {
      col: tile.col,
      row: tile.row,
      ratio: ratio(enemy.telegraphTicks, totalTicks)
    }
  };
}

function telegraphTotalTicks(world: WorldState, enemy: EnemyState): number {
  const behavior = world.content.enemies[enemy.type]?.behavior;

  if (behavior?.kind !== "tentacle") {
    return enemy.telegraphTicks;
  }

  return Math.max(
    Math.ceil(0.8 * TICK_RATE),
    Math.round(behavior.telegraphS * TICK_RATE)
  );
}

function parseTileId(tileId: string): { col: number; row: number } | null {
  const [colRaw, rowRaw, extra] = tileId.split(",");

  if (extra !== undefined || colRaw === undefined || rowRaw === undefined) {
    return null;
  }

  const col = Number(colRaw);
  const row = Number(rowRaw);

  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    return null;
  }

  return { col, row };
}

function ratio(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, value / max));
}

function roundViewNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
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
    case "enemy_screamed":
      return {
        type: "enemy_screamed",
        x: event.pos.x,
        y: event.pos.y
      };
    case "trap_triggered":
      return { type: "trap_triggered", x: event.x, y: event.y };
    case "tile_built":
      return { type: "tile_built", col: event.col, row: event.row };
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
