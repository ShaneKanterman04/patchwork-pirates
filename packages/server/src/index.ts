import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  encodeServerMessage
} from "@patchwork/protocol";
import type { ServerMessage } from "@patchwork/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import {
  buildSnapshot,
  createMatch,
  handleClientMessage,
  matchAddPlayer,
  matchRemovePlayer,
  simEventsToWire,
  stepMatch
} from "./match";

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCH_UP_STEPS = 5;
const SNAPSHOT_INTERVAL_TICKS = 2;

export interface ServerHandle {
  close: () => void;
  match: ReturnType<typeof createMatch>;
  wss: WebSocketServer;
}

export function startServer(port = readPort(), seed = Date.now() >>> 0): ServerHandle {
  const match = createMatch(seed);
  const wss = new WebSocketServer({ port });
  let connNumber = 1;

  console.log(`patchwork server listening on ws://localhost:${port}`);
  console.log(`match seed ${seed}`);

  wss.on("connection", (socket) => {
    const connId = `c${connNumber}`;
    connNumber += 1;
    const playerId = matchAddPlayer(match, connId);

    send(socket, {
      type: "welcome",
      playerId,
      protocolVersion: PROTOCOL_VERSION,
      snapshot: buildSnapshot(match)
    });

    socket.on("message", (raw) => {
      try {
        const msg = decodeClientMessage(rawDataToString(raw));
        handleClientMessage(match, playerId, msg);
      } catch (error) {
        console.warn(
          `dropping invalid client message from ${playerId}: ${String(error)}`
        );
      }
    });

    socket.on("close", () => {
      matchRemovePlayer(match, playerId);
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
      const events = stepMatch(match);

      if (events.length > 0) {
        broadcast(wss, {
          type: "events",
          tick: match.world.tick,
          events: simEventsToWire(events)
        });
      }

      if (match.world.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
        broadcast(wss, { type: "snapshot", snapshot: buildSnapshot(match) });
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
    match,
    wss
  };
}

function broadcast(wss: WebSocketServer, msg: ServerMessage): void {
  const encoded = encodeServerMessage(msg);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
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

startServer();
