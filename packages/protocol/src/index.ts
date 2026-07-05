export const PROTOCOL_VERSION = 1;

export interface RaftTileView {
  col: number;
  row: number;
  kind: "deck" | "core";
  hpRatio: number;
  broken: boolean;
}

export interface RaftView {
  width: number;
  height: number;
  tiles: RaftTileView[];
}

export interface ModuleView {
  id: string;
  defId: string;
  col: number;
  row: number;
  hpRatio: number;
}

export type ShopOfferView =
  | { kind: "weapon"; defId: string; price: number }
  | { kind: "item"; defId: string; price: number }
  | { kind: "sold" };

export interface ShopView {
  offers: ShopOfferView[];
  locked: boolean[];
  rerollCost: number;
}

export interface PlayerView {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facingX: number;
  facingY: number;
  downed: boolean;
  out?: boolean;
  bleedOutRatio?: number;
  reviveProgressRatio?: number;
  characterId?: string | null;
  weaponIds: string[];
  coins?: number;
  shop?: ShopView;
  stats?: {
    damageDealt: number;
    tilesRepaired: number;
    revives: number;
  };
}

export interface EnemyView {
  id: string;
  kind: string;
  x: number;
  y: number;
  hpRatio: number;
  radius: number;
  telegraph?: {
    col: number;
    row: number;
    ratio: number;
  };
}

export interface BossView {
  phase: "tentacles" | "head" | "between";
  hpRatio: number;
}

export interface PickupView {
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface ProjView {
  id: string;
  kind: string;
  x: number;
  y: number;
  faction?: "player" | "enemy";
}

export interface PingView {
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface HazardView {
  id: string;
  kind: string;
  x: number;
  y: number;
  radius: number;
}

export interface WavePhaseView {
  number: number;
  phase: "lobby" | "combat" | "build" | "victory" | "defeat";
  timeLeft: number;
}

export interface Snapshot {
  tick: number;
  players: PlayerView[];
  enemies: EnemyView[];
  projectiles: ProjView[];
  pickups: PickupView[];
  wave: WavePhaseView;
  raft?: RaftView;
  salvage?: number;
  supplyCap?: number;
  modules?: ModuleView[];
  pings?: PingView[];
  hazards?: HazardView[];
  boss?: BossView | null;
}

export type WireEvent =
  | {
      type: "weapon_fired";
      wielderId: string;
      weaponId: string;
      ox: number;
      oy: number;
      dx: number;
      dy: number;
      arcDegrees: number;
      range: number;
    }
  | { type: "enemy_hit"; enemyId: string; damage: number; x: number; y: number }
  | { type: "enemy_killed"; enemyId: string; x: number; y: number }
  | { type: "explosion"; x: number; y: number; radius: number }
  | { type: "trap_triggered"; x: number; y: number }
  | { type: "tile_built"; col: number; row: number }
  | { type: "tile_broken"; col: number; row: number }
  | { type: "tile_repaired"; col: number; row: number }
  | { type: "core_destroyed" };

export type ServerMessage =
  | {
      type: "welcome";
      playerId: string;
      protocolVersion: number;
      snapshot: Snapshot;
    }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "events"; tick: number; events: WireEvent[] }
  | { type: "lobby_joined"; code: string; playerId: string }
  | { type: "lobby_error"; message: string }
  | { type: "lobby_state"; code: string; players: LobbyPlayer[]; canStart: boolean };

export interface LobbyPlayer {
  id: string;
  characterId: string | null;
  ready: boolean;
}

export type ClientMessage =
  | { type: "create" }
  | { type: "join"; code: string }
  | { type: "rejoin"; code: string; playerId: string }
  | { type: "select"; characterId: string }
  | { type: "lobby_ready"; ready: boolean }
  | {
      type: "player_input";
      seq: number;
      movement: { x: number; y: number };
      dash: boolean;
      interact: boolean;
    }
  | { type: "buy"; index: number }
  | { type: "sell_weapon"; index: number }
  | { type: "reroll" }
  | { type: "lock"; index: number }
  | { type: "ready"; ready: boolean }
  | { type: "place_module"; defId: string; col: number; row: number }
  | { type: "build_tile"; col: number; row: number }
  | { type: "ping" };

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeServerMessage(raw: string): ServerMessage {
  const msg = parseJsonRecord(raw);

  if (
    msg.type !== "welcome" &&
    msg.type !== "snapshot" &&
    msg.type !== "events" &&
    msg.type !== "lobby_joined" &&
    msg.type !== "lobby_error" &&
    msg.type !== "lobby_state"
  ) {
    throw new Error(`Unknown server message type: ${String(msg.type)}`);
  }

  return msg as ServerMessage;
}

export function encodeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}

export function decodeClientMessage(raw: string): ClientMessage {
  const msg = parseJsonRecord(raw);

  if (
    msg.type !== "player_input" &&
    msg.type !== "create" &&
    msg.type !== "join" &&
    msg.type !== "rejoin" &&
    msg.type !== "select" &&
    msg.type !== "lobby_ready" &&
    msg.type !== "buy" &&
    msg.type !== "sell_weapon" &&
    msg.type !== "reroll" &&
    msg.type !== "lock" &&
    msg.type !== "ready" &&
    msg.type !== "place_module" &&
    msg.type !== "build_tile" &&
    msg.type !== "ping"
  ) {
    throw new Error(`Unknown client message type: ${String(msg.type)}`);
  }

  if (msg.type === "build_tile") {
    if (!Number.isFinite(msg.col) || !Number.isFinite(msg.row)) {
      throw new Error("Invalid build_tile coordinates");
    }
  }

  if (msg.type === "sell_weapon") {
    if (typeof msg.index !== "number" || !Number.isInteger(msg.index) || msg.index < 0) {
      throw new Error("Invalid sell_weapon index");
    }
  }

  return msg as ClientMessage;
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Protocol message must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}
