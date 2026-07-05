import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage
} from "@patchwork/protocol";
import type { ClientMessage, Snapshot, WireEvent } from "@patchwork/protocol";
import type { BufferedSnapshot } from "./interp";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const DEFAULT_WS_URL = "ws://localhost:8080";
const MAX_SNAPSHOTS = 12;
const RECONNECT_DELAY_MS = 1_000;

export interface Connection {
  readonly snapshots: readonly BufferedSnapshot[];
  readonly status: ConnectionStatus;
  readonly myPlayerId: string | undefined;
  readonly latestSnapshot: Snapshot | undefined;
  sendInput: (input: ClientMessage) => void;
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

  return envUrl ?? DEFAULT_WS_URL;
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
  let closedByClient = false;
  let reconnectTimer: number | undefined;

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
        } else {
          onEvents(msg.events);
        }

        onStatusChange();
      } catch (error) {
        console.warn(`Dropping invalid server message: ${String(error)}`);
      }
    });

    socket.addEventListener("close", () => {
      status = "disconnected";
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
    sendInput(input: ClientMessage): void {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(encodeClientMessage(input));
      }
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
