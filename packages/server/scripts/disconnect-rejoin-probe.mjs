/* global clearTimeout, console, process, setTimeout */

import WebSocket from "ws";
import {
  decodeServerMessage,
  encodeClientMessage
} from "@patchwork/protocol";

const port = process.env.PORT ?? "8080";
const url = `ws://localhost:${port}`;
const captain = connectClient("captain");
const fisher = connectClient("fisher");

let rejoin = null;
let code = "";
let captainId = "";
let fisherId = "";
let captainSnapshotsAfterDrop = 0;
let completed = false;
let fisherClosed = false;
let rejoinStarted = false;

const timeout = setTimeout(() => {
  fail(new Error("probe timed out"));
}, 8000);

captain.socket.on("open", () => {
  captain.send({ type: "create" });
});

captain.on("lobby_joined", (msg) => {
  if (code !== "") {
    return;
  }

  code = msg.code;
  captainId = msg.playerId;
  whenOpen(fisher.socket, () => {
    fisher.send({ type: "join", code });
  });
});

fisher.on("lobby_joined", (msg) => {
  fisherId = msg.playerId;
  captain.send({ type: "select", characterId: "captain" });
  fisher.send({ type: "select", characterId: "fisher" });
  captain.send({ type: "lobby_ready", ready: true });
  fisher.send({ type: "lobby_ready", ready: true });
});

captain.on("snapshot", (msg) => {
  if (completed) {
    return;
  }

  if (!fisherClosed && msg.snapshot.wave.phase === "combat") {
    fisherClosed = true;
    fisher.socket.close();
    return;
  }

  if (!fisherClosed) {
    return;
  }

  captainSnapshotsAfterDrop += 1;
  const fisherView = msg.snapshot.players.find((player) => player.id === fisherId);
  if (
    rejoinStarted ||
    fisherView?.downed !== true ||
    captainSnapshotsAfterDrop < 2
  ) {
    return;
  }

  rejoinStarted = true;
  console.log(`code: ${code}`);
  console.log(`captain playerId: ${captainId}`);
  console.log(`fisher playerId: ${fisherId}`);
  console.log(`fisher downed after close: ${fisherView.downed}`);
  console.log(`captain snapshots after close: ${captainSnapshotsAfterDrop}`);

  rejoin = connectClient("rejoin");
  rejoin.on("lobby_joined", (joined) => {
    console.log(
      `rejoin lobby_joined: ${joined.code}/${joined.playerId}`
    );
  });
  rejoin.on("snapshot", (snapshotMsg) => {
    const rejoinedFisher = snapshotMsg.snapshot.players.find(
      (player) => player.id === fisherId
    );
    if (rejoinedFisher === undefined) {
      return;
    }

    completed = true;
    clearTimeout(timeout);
    console.log(`rejoin snapshot phase: ${snapshotMsg.snapshot.wave.phase}`);
    console.log(`rejoin controls existing slot: ${rejoinedFisher.id === fisherId}`);
    closeClients();
  });
  whenOpen(rejoin.socket, () => {
    rejoin.send({ type: "rejoin", code, playerId: fisherId });
  });
});

function connectClient(label) {
  const socket = new WebSocket(url);
  const handlers = new Map();

  socket.on("message", (raw) => {
    const msg = decodeServerMessage(raw.toString());
    const callbacks = handlers.get(msg.type) ?? [];
    for (const callback of callbacks) {
      callback(msg);
    }
  });

  socket.on("error", (error) => {
    fail(new Error(`${label}: ${error.message}`));
  });

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

function whenOpen(socket, callback) {
  if (socket.readyState === WebSocket.OPEN) {
    callback();
    return;
  }

  socket.on("open", callback);
}

function closeClients() {
  captain.socket.close();
  fisher.socket.close();
  rejoin?.socket.close();
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
