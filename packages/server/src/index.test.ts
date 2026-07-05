import { describe, expect, it } from "vitest";
import { decodeServerMessage, encodeClientMessage } from "@patchwork/protocol";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { startServer } from "./index";

describe("server lobby wire routing", () => {
  it("sends lobby_error for a bad join code", async () => {
    const server = startServer(0, 123);
    const address = server.wss.address() as AddressInfo;
    const socket = new WebSocket(`ws://localhost:${address.port}`);

    try {
      await waitForOpen(socket);
      socket.send(encodeClientMessage({ type: "join", code: "NOPE" }));
      const msg = await waitForMessage(socket);

      expect(msg).toEqual({ type: "lobby_error", message: "Lobby not found." });
    } finally {
      socket.close();
      server.close();
    }
  });
});

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function waitForMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.once("message", (raw) => {
      resolve(decodeServerMessage(raw.toString()));
    });
    socket.once("error", reject);
  });
}
