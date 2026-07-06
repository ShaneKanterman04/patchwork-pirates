import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage
} from "@patchwork/protocol";
import type { ClientMessage, LobbyPlayer, Snapshot, WireEvent } from "@patchwork/protocol";
import type { BufferedSnapshot } from "./interp";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const DEFAULT_WS_PORT = 8080;
const MAX_SNAPSHOTS = 12;
const RECONNECT_DELAY_MS = 1_000;
const REJOIN_CODE_KEY = "patchwork.rejoin.code";
const REJOIN_PLAYER_KEY = "patchwork.rejoin.playerId";

export interface LobbyState {
  code: string | undefined;
  players: LobbyPlayer[];
  canStart: boolean;
  error: string | undefined;
}

export interface RejoinState {
  code: string;
  playerId: string;
  available: boolean;
}

export interface Connection {
  readonly snapshots: readonly BufferedSnapshot[];
  readonly status: ConnectionStatus;
  readonly myPlayerId: string | undefined;
  readonly latestSnapshot: Snapshot | undefined;
  readonly lobby: LobbyState;
  readonly rejoin: RejoinState | undefined;
  sendInput: (input: ClientMessage) => void;
  createLobby: () => void;
  joinLobby: (code: string) => void;
  selectCharacter: (characterId: string) => void;
  setLobbyReady: (ready: boolean) => void;
  sendPing: () => void;
  rejoinStored: () => void;
  clearSession: () => void;
  close: () => void;
}

export function resolveWsUrl(
  location: Pick<Location, "search" | "protocol" | "hostname">,
  envUrl: string | undefined
): string {
  const params = new URLSearchParams(location.search);
  const explicitWs = params.get("ws");

  if (explicitWs !== null && explicitWs.length > 0) {
    return explicitWs;
  }

  const port = params.get("port");

  if (port !== null && port.length > 0) {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${location.hostname}:${port}`;
  }

  if (envUrl !== undefined && envUrl.length > 0) {
    return envUrl;
  }

  // Default to the SAME host the page was served from (so opening the dashboard
  // from another device on the LAN connects back to this server, not the
  // viewer's own localhost). Override with VITE_WS_URL or ?ws=/?port=.
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.hostname}:${DEFAULT_WS_PORT}`;
}

export function connect(
  url: string,
  onEvents: (events: WireEvent[]) => void,
  onStatusChange: () => void = () => undefined,
  nowMs: () => number = () => performance.now()
): Connection {
  const snapshots: BufferedSnapshot[] = [];
  let socket: WebSocket | undefined;
  let status: ConnectionStatus = "connecting";
  let myPlayerId: string | undefined;
  let latestSnapshot: Snapshot | undefined;
  let lobby: LobbyState = { code: undefined, players: [], canStart: false, error: undefined };
  let rejoin = readRejoinState(false);
  let closedByClient = false;
  let reconnectTimer: number | undefined;

  const send = (input: ClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(encodeClientMessage(input));
    }
  };

  const clearSession = (): void => {
    snapshots.splice(0, snapshots.length);
    latestSnapshot = undefined;
    myPlayerId = undefined;
    lobby = { code: undefined, players: [], canStart: false, error: undefined };
  };

  const openSocket = (): void => {
    status = "connecting";
    onStatusChange();
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      status = "connecting";
      onStatusChange();
    });

    socket.addEventListener("message", (event) => {
      try {
        const msg = decodeServerMessage(String(event.data));

        if (msg.type === "welcome") {
          myPlayerId = msg.playerId;
          latestSnapshot = msg.snapshot;
          if (lobby.code !== undefined) {
            persistRejoin(lobby.code, msg.playerId);
            rejoin = readRejoinState(false);
          }
          snapshots.splice(0, snapshots.length, {
            recvTimeMs: nowMs(),
            snapshot: msg.snapshot
          });
          status = "connected";

          if (msg.protocolVersion !== PROTOCOL_VERSION) {
            console.warn(
              `Protocol mismatch: server=${msg.protocolVersion} client=${PROTOCOL_VERSION}`
            );
          }
        } else if (msg.type === "snapshot") {
          latestSnapshot = msg.snapshot;
          snapshots.push({ recvTimeMs: nowMs(), snapshot: msg.snapshot });

          if (snapshots.length > MAX_SNAPSHOTS) {
            snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
          }
        } else if (msg.type === "events") {
          onEvents(msg.events);
        } else if (msg.type === "lobby_joined") {
          myPlayerId = msg.playerId;
          lobby = { ...lobby, code: msg.code, error: undefined };
          persistRejoin(msg.code, msg.playerId);
          rejoin = readRejoinState(false);
        } else if (msg.type === "lobby_error") {
          lobby = { ...lobby, error: msg.message };
        } else if (isLeftMessage(msg)) {
          clearSession();
        } else {
          lobby = {
            code: msg.code,
            players: msg.players,
            canStart: msg.canStart,
            error: undefined
          };
        }

        onStatusChange();
      } catch (error) {
        console.warn(`Dropping invalid server message: ${String(error)}`);
      }
    });

    socket.addEventListener("close", () => {
      status = "disconnected";
      rejoin = readRejoinState(true);
      onStatusChange();

      if (!closedByClient) {
        reconnectTimer = window.setTimeout(openSocket, RECONNECT_DELAY_MS);
      }
    });

    socket.addEventListener("error", () => {
      status = "disconnected";
      onStatusChange();
    });
  };

  openSocket();

  return {
    get snapshots() {
      return snapshots;
    },
    get status() {
      return status;
    },
    get myPlayerId() {
      return myPlayerId;
    },
    get latestSnapshot() {
      return latestSnapshot;
    },
    get lobby() {
      return lobby;
    },
    get rejoin() {
      return rejoin;
    },
    sendInput(input: ClientMessage): void {
      send(input);
    },
    createLobby(): void {
      send({ type: "create" });
    },
    joinLobby(code: string): void {
      send({ type: "join", code: code.trim().toUpperCase() });
    },
    selectCharacter(characterId: string): void {
      send({ type: "select", characterId });
    },
    setLobbyReady(ready: boolean): void {
      send({ type: "lobby_ready", ready });
    },
    sendPing(): void {
      send({ type: "ping" });
    },
    rejoinStored(): void {
      const stored = readRejoinState(false);
      if (stored !== undefined) {
        send({ type: "rejoin", code: stored.code, playerId: stored.playerId });
      }
    },
    clearSession(): void {
      clearSession();
      onStatusChange();
    },
    close(): void {
      closedByClient = true;

      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    }
  };
}

function isLeftMessage(message: { type: string }): message is { type: "left" } {
  return message.type === "left";
}

function persistRejoin(code: string, playerId: string): void {
  try {
    window.sessionStorage.setItem(REJOIN_CODE_KEY, code);
    window.sessionStorage.setItem(REJOIN_PLAYER_KEY, playerId);
  } catch {
    // Private browsing or embedded contexts may reject sessionStorage.
  }
}

function readRejoinState(available: boolean): RejoinState | undefined {
  try {
    const code = window.sessionStorage.getItem(REJOIN_CODE_KEY);
    const playerId = window.sessionStorage.getItem(REJOIN_PLAYER_KEY);

    if (code === null || playerId === null) {
      return undefined;
    }

    return { code, playerId, available };
  } catch {
    return undefined;
  }
}
