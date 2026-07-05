/* global clearInterval, console, process, setInterval, setTimeout */

import WebSocket from "ws";
import {
  decodeServerMessage,
  encodeClientMessage
} from "@patchwork/protocol";

const port = process.env.PORT ?? "8080";
const socket = new WebSocket(`ws://localhost:${port}`);

let welcomePlayerId = "";
let snapshots = 0;
let firstX;
let lastX;
let sawEvent = false;
let sawCombatEvent = false;
let seq = 1;

const inputTimer = setInterval(() => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(
    encodeClientMessage({
      type: "player_input",
      seq,
      movement: { x: 1, y: 0 },
      dash: false,
      interact: false
    })
  );
  seq += 1;
}, 50);

socket.on("message", (raw) => {
  const msg = decodeServerMessage(raw.toString());

  if (msg.type === "welcome") {
    welcomePlayerId = msg.playerId;
    const player = msg.snapshot.players.find((entry) => entry.id === msg.playerId);
    firstX = player?.x;
    lastX = player?.x;
    return;
  }

  if (msg.type === "snapshot") {
    snapshots += 1;
    const player = msg.snapshot.players.find((entry) => entry.id === welcomePlayerId);

    if (player !== undefined) {
      if (firstX === undefined) {
        firstX = player.x;
      }

      lastX = player.x;
    }
    return;
  }

  sawEvent = sawEvent || msg.events.length > 0;
  sawCombatEvent =
    sawCombatEvent ||
    msg.events.some(
      (event) => event.type === "weapon_fired" || event.type === "enemy_hit"
    );
});

socket.on("open", () => {
  setTimeout(() => {
    clearInterval(inputTimer);
    socket.close();
  }, 1100);
});

socket.on("close", () => {
  console.log(`welcome playerId: ${welcomePlayerId}`);
  console.log(`snapshots received: ${snapshots}`);
  console.log(`player x before: ${formatNumber(firstX)}`);
  console.log(`player x after: ${formatNumber(lastX)}`);
  console.log(`player moved right: ${lastX !== undefined && firstX !== undefined && lastX > firstX}`);
  console.log(`events seen: ${sawEvent}`);
  console.log(`weapon_fired/enemy_hit seen: ${sawCombatEvent}`);
});

socket.on("error", (error) => {
  clearInterval(inputTimer);
  console.error(error);
  process.exitCode = 1;
});

function formatNumber(value) {
  return value === undefined ? "undefined" : value.toFixed(4);
}
