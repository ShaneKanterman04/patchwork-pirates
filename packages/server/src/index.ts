import { pathToFileURL } from "node:url";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  encodeServerMessage
} from "@patchwork/protocol";
import type { ClientMessage, ServerMessage } from "@patchwork/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import {
  addConnectionToLobby,
  buildLobbyPlayers,
  buildSnapshot,
  canStartLobby,
  createMatchEntry,
  disconnectRunningConnection,
  handleClientMessage,
  reattachDisconnectedConnection,
  removeConnectionFromLobby,
  selectLobbyCharacter,
  setLobbyReady,
  simEventsToWire,
  stepMatch
} from "./match";
import type { MatchEntry } from "./match";

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCH_UP_STEPS = 5;
const SNAPSHOT_INTERVAL_TICKS = 2;
const MAX_LOBBY_PLAYERS = 4;
const CODE_LENGTH = 4;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface ServerHandle {
  close: () => void;
  matches: Map<string, MatchEntry>;
  wss: WebSocketServer;
}

interface ConnectionState {
  id: string;
  socket: WebSocket;
  code: string | null;
  playerId: string | null;
}

export function startServer(port = readPort(), seed = Date.now() >>> 0): ServerHandle {
  const matches = new Map<string, MatchEntry>();
  const connections = new Map<string, ConnectionState>();
  const wss = new WebSocketServer({ port });
  let connNumber = 1;
  let nextSeed = seed >>> 0;

  console.log(`patchwork server listening on ws://localhost:${port}`);
  console.log(`base match seed ${seed}`);

  wss.on("connection", (socket) => {
    const conn: ConnectionState = {
      id: `c${connNumber}`,
      socket,
      code: null,
      playerId: null
    };
    connNumber += 1;
    connections.set(conn.id, conn);

    socket.on("message", (raw) => {
      try {
        const msg = decodeClientMessage(rawDataToString(raw));
        routeClientMessage(matches, connections, conn, msg, nextSeed);
        if (msg.type === "create") {
          nextSeed = (nextSeed + 1) >>> 0;
        }
      } catch (error) {
        console.warn(
          `dropping invalid client message from ${conn.id}: ${String(error)}`
        );
        send(socket, { type: "lobby_error", message: "Invalid message." });
      }
    });

    socket.on("close", () => {
      removeConnection(matches, connections, conn);
    });
  });

  let lastMs = Date.now();
  let accumulatorMs = 0;

  const interval = setInterval(() => {
    const nowMs = Date.now();
    accumulatorMs += nowMs - lastMs;
    lastMs = nowMs;

    let steps = 0;
    while (accumulatorMs >= TICK_MS && steps < MAX_CATCH_UP_STEPS) {
      for (const entry of matches.values()) {
        const events = stepMatch(entry.match);

        if (events.length > 0) {
          broadcastToMatch(connections, entry, {
            type: "events",
            tick: entry.match.world.tick,
            events: simEventsToWire(events)
          });
        }

        if (entry.match.world.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
          broadcastToMatch(connections, entry, {
            type: "snapshot",
            snapshot: buildSnapshot(entry.match)
          });
        }
      }

      accumulatorMs -= TICK_MS;
      steps += 1;
    }

    if (steps === MAX_CATCH_UP_STEPS) {
      accumulatorMs = Math.min(accumulatorMs, TICK_MS);
    }
  }, 10);

  return {
    close: () => {
      clearInterval(interval);
      wss.close();
    },
    matches,
    wss
  };
}

function routeClientMessage(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  msg: ClientMessage,
  seed: number
): void {
  switch (msg.type) {
    case "create":
      createLobby(matches, connections, conn, seed);
      return;
    case "join":
      joinLobby(matches, connections, conn, msg.code);
      return;
    case "rejoin":
      rejoinMatch(matches, connections, conn, msg.code, msg.playerId);
      return;
    case "select":
      handleSelect(matches, connections, conn, msg.characterId);
      return;
    case "lobby_ready":
      handleLobbyReady(matches, connections, conn, msg.ready);
      return;
    default:
      routeRunMessage(matches, conn, msg);
  }
}

function createLobby(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  seed: number
): void {
  leaveCurrentLobby(matches, connections, conn);
  const code = generateLobbyCode(matches);
  const entry = createMatchEntry(code, seed);
  matches.set(code, entry);
  const playerId = addConnectionToLobby(entry, conn.id);
  conn.code = code;
  conn.playerId = playerId;

  send(conn.socket, { type: "lobby_joined", code, playerId });
  send(conn.socket, {
    type: "welcome",
    playerId,
    protocolVersion: PROTOCOL_VERSION,
    snapshot: buildSnapshot(entry.match)
  });
  broadcastLobbyStateForEntry(connections, entry);
}

function joinLobby(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  requestedCode: string
): void {
  const code = normalizeCode(requestedCode);
  const entry = matches.get(code);

  if (entry === undefined) {
    send(conn.socket, { type: "lobby_error", message: "Lobby not found." });
    return;
  }

  if (entry.lobby.started) {
    send(conn.socket, { type: "lobby_error", message: "Run already started." });
    return;
  }

  if (entry.match.world.players.length >= MAX_LOBBY_PLAYERS) {
    send(conn.socket, { type: "lobby_error", message: "Lobby is full." });
    return;
  }

  leaveCurrentLobby(matches, connections, conn);
  const playerId = addConnectionToLobby(entry, conn.id);
  conn.code = code;
  conn.playerId = playerId;

  send(conn.socket, { type: "lobby_joined", code, playerId });
  send(conn.socket, {
    type: "welcome",
    playerId,
    protocolVersion: PROTOCOL_VERSION,
    snapshot: buildSnapshot(entry.match)
  });
  broadcastLobbyStateForEntry(connections, entry);
}

function rejoinMatch(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  requestedCode: string,
  playerId: string
): void {
  const code = normalizeCode(requestedCode);
  const entry = matches.get(code);

  if (entry === undefined) {
    send(conn.socket, { type: "lobby_error", message: "Lobby not found." });
    return;
  }

  if (isTerminalPhase(entry)) {
    send(conn.socket, { type: "lobby_error", message: "Match has ended." });
    return;
  }

  if (!entry.disconnected.has(playerId)) {
    send(conn.socket, { type: "lobby_error", message: "Player slot is not disconnected." });
    return;
  }

  leaveCurrentLobby(matches, connections, conn);
  if (!reattachDisconnectedConnection(entry, conn.id, playerId)) {
    send(conn.socket, { type: "lobby_error", message: "Player slot not found." });
    return;
  }

  conn.code = code;
  conn.playerId = playerId;

  send(conn.socket, { type: "lobby_joined", code, playerId });
  send(conn.socket, {
    type: "welcome",
    playerId,
    protocolVersion: PROTOCOL_VERSION,
    snapshot: buildSnapshot(entry.match)
  });
}

function handleSelect(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  characterId: string
): void {
  const routed = routeLobbyMessage(matches, conn);
  if (routed === null) {
    return;
  }

  if (!selectLobbyCharacter(routed.entry, routed.playerId, characterId)) {
    send(conn.socket, {
      type: "lobby_error",
      message: "Character is not available in this lobby."
    });
    return;
  }

  broadcastLobbyStateForEntry(connections, routed.entry);
}

function handleLobbyReady(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState,
  ready: boolean
): void {
  const routed = routeLobbyMessage(matches, conn);
  if (routed === null) {
    return;
  }

  setLobbyReady(routed.entry, routed.playerId, ready);
  broadcastLobbyStateForEntry(connections, routed.entry);
}

function routeRunMessage(
  matches: Map<string, MatchEntry>,
  conn: ConnectionState,
  msg: ClientMessage
): void {
  const routed = routeLobbyMessage(matches, conn);
  if (routed === null) {
    return;
  }

  handleClientMessage(routed.entry.match, routed.playerId, msg);
}

function routeLobbyMessage(
  matches: Map<string, MatchEntry>,
  conn: ConnectionState
): { entry: MatchEntry; playerId: string } | null {
  if (conn.code === null || conn.playerId === null) {
    send(conn.socket, {
      type: "lobby_error",
      message: "Create or join a lobby first."
    });
    return null;
  }

  const entry = matches.get(conn.code);
  if (entry === undefined) {
    conn.code = null;
    conn.playerId = null;
    send(conn.socket, { type: "lobby_error", message: "Lobby no longer exists." });
    return null;
  }

  return { entry, playerId: conn.playerId };
}

function removeConnection(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState
): void {
  leaveCurrentLobby(matches, connections, conn);
  connections.delete(conn.id);
}

function leaveCurrentLobby(
  matches: Map<string, MatchEntry>,
  connections: Map<string, ConnectionState>,
  conn: ConnectionState
): void {
  if (conn.code === null) {
    return;
  }

  const entry = matches.get(conn.code);
  if (entry !== undefined) {
    if (isPersistentRunPhase(entry)) {
      disconnectRunningConnection(entry, conn.id);
    } else {
      removeConnectionFromLobby(entry, conn.id);
    }

    if (entry.conns.size === 0 && !isPersistentRunPhase(entry)) {
      matches.delete(entry.code);
    } else if (!isPersistentRunPhase(entry)) {
      broadcastLobbyStateForEntry(connections, entry);
    }
  }

  conn.code = null;
  conn.playerId = null;
}

function broadcastLobbyStateForEntry(
  connections: Map<string, ConnectionState>,
  entry: MatchEntry
): void {
  const msg: ServerMessage = {
    type: "lobby_state",
    code: entry.code,
    players: buildLobbyPlayers(entry),
    canStart: canStartLobby(entry)
  };

  for (const connId of entry.conns.keys()) {
    const conn = connections.get(connId);
    if (conn !== undefined) {
      send(conn.socket, msg);
    }
  }
}

function broadcastToMatch(
  connections: Map<string, ConnectionState>,
  entry: MatchEntry,
  msg: ServerMessage
): void {
  for (const connId of entry.conns.keys()) {
    const conn = connections.get(connId);
    if (conn !== undefined) {
      send(conn.socket, msg);
    }
  }
}

function generateLobbyCode(matches: Map<string, MatchEntry>): string {
  for (let attempts = 0; attempts < 1000; attempts += 1) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }

    if (!matches.has(code)) {
      return code;
    }
  }

  throw new Error("Unable to generate a unique lobby code");
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function isPersistentRunPhase(entry: MatchEntry): boolean {
  return entry.match.world.run.phase === "combat" || entry.match.world.run.phase === "build";
}

function isTerminalPhase(entry: MatchEntry): boolean {
  return entry.match.world.run.phase === "victory" || entry.match.world.run.phase === "defeat";
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(encodeServerMessage(msg));
  }
}

function readPort(): number {
  const raw = process.env.PORT;

  if (raw === undefined) {
    return 8080;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  return parsed;
}

function rawDataToString(raw: RawData): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  return Buffer.concat(raw).toString("utf8");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
