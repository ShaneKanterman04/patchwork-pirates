/* global clearTimeout, console, process, setTimeout */

import WebSocket from "ws";
import {
  decodeServerMessage,
  encodeClientMessage
} from "@patchwork/protocol";

const port = process.env.PORT ?? "8080";
const url = `ws://localhost:${port}`;
const captain = connectClient();
const fisher = connectClient();
let code = "";
let captainId = "";
let fisherId = "";
let completed = false;

const timeout = setTimeout(() => {
  fail(new Error("probe timed out"));
}, 5000);

captain.socket.on("open", () => {
  captain.send({ type: "create" });
});

captain.on("lobby_joined", (msg) => {
  code = msg.code;
  captainId = msg.playerId;
  if (fisher.socket.readyState === WebSocket.OPEN) {
    fisher.send({ type: "join", code });
  } else {
    fisher.socket.on("open", () => {
      fisher.send({ type: "join", code });
    });
  }
});

fisher.on("lobby_joined", (msg) => {
  fisherId = msg.playerId;
  captain.send({ type: "select", characterId: "captain" });
  fisher.send({ type: "select", characterId: "fisher" });
  captain.send({ type: "lobby_ready", ready: true });
  fisher.send({ type: "lobby_ready", ready: true });
});

for (const client of [captain, fisher]) {
  client.on("snapshot", (msg) => {
    if (completed || msg.snapshot.wave.phase !== "combat") {
      return;
    }

    const ids = msg.snapshot.players.map((player) => player.id).sort();
    if (!ids.includes(captainId) || !ids.includes(fisherId)) {
      return;
    }

    completed = true;
    clearTimeout(timeout);
    console.log(`code: ${code}`);
    console.log(`captain playerId: ${captainId}`);
    console.log(`fisher playerId: ${fisherId}`);
    console.log(`combat phase: ${msg.snapshot.wave.phase}`);
    console.log(`snapshot players: ${ids.join(",")}`);
    closeClients();
  });
}

function connectClient() {
  const socket = new WebSocket(url);
  const handlers = new Map();

  socket.on("message", (raw) => {
    const msg = decodeServerMessage(raw.toString());
    const callbacks = handlers.get(msg.type) ?? [];
    for (const callback of callbacks) {
      callback(msg);
    }
  });

  socket.on("error", fail);

  return {
    socket,
    on(type, callback) {
      handlers.set(type, [...(handlers.get(type) ?? []), callback]);
    },
    send(msg) {
      socket.send(encodeClientMessage(msg));
    }
  };
}

function closeClients() {
  captain.socket.close();
  fisher.socket.close();
}

function fail(error) {
  if (completed) {
    return;
  }

  completed = true;
  clearTimeout(timeout);
  closeClients();
  console.error(error);
  process.exitCode = 1;
}
