import { describe, expect, it } from "vitest";
import { decodeServerMessage, encodeClientMessage } from "@patchwork/protocol";
import type { ClientMessage, Snapshot } from "@patchwork/protocol";
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

  it("removes and drops an empty pre-start lobby when its socket closes", async () => {
    const server = startServer(0, 123);
    const socket = new WebSocket(serverUrl(server));

    try {
      await waitForOpen(socket);
      socket.send(encodeClientMessage({ type: "create" }));
      const joined = await waitForMessage(socket);

      expect(joined).toMatchObject({ type: "lobby_joined" });
      const code = (joined as { code: string }).code;

      socket.close();
      await waitForCondition(() => !server.matches.has(code));

      expect(server.matches.has(code)).toBe(false);
    } finally {
      socket.close();
      server.close();
    }
  });

  it("disconnecting during a run downs the slot, keeps the match alive, and rejoin reattaches it", async () => {
    const server = startServer(0, 123);
    const captain = new WebSocket(serverUrl(server));
    const fisher = new WebSocket(serverUrl(server));
    const rejoin = new WebSocket(serverUrl(server));

    try {
      const started = await startTwoPlayerRun(captain, fisher);

      fisher.close();
      await waitForCondition(() => {
        const entry = server.matches.get(started.code);
        return entry?.disconnected.has(started.fisherId) === true;
      });

      const entry = server.matches.get(started.code);
      const fisherState = entry?.match.world.players.find(
        (player) => player.id === started.fisherId
      );

      expect(entry).toBeDefined();
      expect(server.matches.has(started.code)).toBe(true);
      expect(entry?.match.world.players.map((player) => player.id).sort()).toEqual([
        started.captainId,
        started.fisherId
      ]);
      expect(fisherState).toMatchObject({ downed: true, out: false, hp: 0 });

      await waitForOpen(rejoin);
      const joinedPromise = waitForMessageOfType(rejoin, "lobby_joined");
      const welcomePromise = waitForMessageOfType(rejoin, "welcome");
      rejoin.send(
        encodeClientMessage({
          type: "rejoin",
          code: started.code,
          playerId: started.fisherId
        })
      );

      const joined = await joinedPromise;
      const welcome = await welcomePromise;

      expect(joined).toEqual({
        type: "lobby_joined",
        code: started.code,
        playerId: started.fisherId
      });
      expect(welcome).toMatchObject({
        type: "welcome",
        playerId: started.fisherId
      });
      expect(entry?.disconnected.has(started.fisherId)).toBe(false);
      expect([...entry!.conns.values()]).toContain(started.fisherId);
    } finally {
      captain.close();
      fisher.close();
      rejoin.close();
      server.close();
    }
  });

  it("rejects rejoin for a bad code, bad player id, or still-connected slot", async () => {
    const server = startServer(0, 123);
    const captain = new WebSocket(serverUrl(server));
    const fisher = new WebSocket(serverUrl(server));
    const badCode = new WebSocket(serverUrl(server));
    const badPlayer = new WebSocket(serverUrl(server));
    const stillConnected = new WebSocket(serverUrl(server));

    try {
      const started = await startTwoPlayerRun(captain, fisher);

      await expectRejoinError(badCode, {
        type: "rejoin",
        code: "NOPE",
        playerId: started.fisherId
      });
      await expectRejoinError(badPlayer, {
        type: "rejoin",
        code: started.code,
        playerId: "p999"
      });
      await expectRejoinError(stillConnected, {
        type: "rejoin",
        code: started.code,
        playerId: started.fisherId
      });
    } finally {
      captain.close();
      fisher.close();
      badCode.close();
      badPlayer.close();
      stillConnected.close();
      server.close();
    }
  });
});

interface StartedRun {
  code: string;
  captainId: string;
  fisherId: string;
}

function serverUrl(server: ReturnType<typeof startServer>): string {
  const address = server.wss.address() as AddressInfo;
  return `ws://localhost:${address.port}`;
}

async function startTwoPlayerRun(
  captain: WebSocket,
  fisher: WebSocket
): Promise<StartedRun> {
  await Promise.all([waitForOpen(captain), waitForOpen(fisher)]);
  captain.send(encodeClientMessage({ type: "create" }));
  const captainJoined = await waitForMessage(captain);
  expect(captainJoined).toMatchObject({ type: "lobby_joined" });

  const code = (captainJoined as { code: string }).code;
  const captainId = (captainJoined as { playerId: string }).playerId;

  fisher.send(encodeClientMessage({ type: "join", code }));
  const fisherJoined = await waitForMessage(fisher);
  expect(fisherJoined).toMatchObject({ type: "lobby_joined" });

  const fisherId = (fisherJoined as { playerId: string }).playerId;

  captain.send(encodeClientMessage({ type: "select", characterId: "captain" }));
  fisher.send(encodeClientMessage({ type: "select", characterId: "fisher" }));
  captain.send(encodeClientMessage({ type: "lobby_ready", ready: true }));
  fisher.send(encodeClientMessage({ type: "lobby_ready", ready: true }));

  await waitForSnapshot(captain, (snapshot) => snapshot.wave.phase === "combat");

  return { code, captainId, fisherId };
}

async function expectRejoinError(
  socket: WebSocket,
  msg: ClientMessage
): Promise<void> {
  await waitForOpen(socket);
  socket.send(encodeClientMessage(msg));
  const error = await waitForMessage(socket);
  expect(error).toMatchObject({ type: "lobby_error" });
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

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

function waitForMessageOfType(
  socket: WebSocket,
  type: ReturnType<typeof decodeServerMessage>["type"]
): Promise<ReturnType<typeof decodeServerMessage>> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: Buffer) => {
      const msg = decodeServerMessage(raw.toString());
      if (msg.type === type) {
        cleanup();
        resolve(msg);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.once("error", onError);
  });
}

function waitForSnapshot(
  socket: WebSocket,
  predicate: (snapshot: Snapshot) => boolean
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: Buffer) => {
      const msg = decodeServerMessage(raw.toString());
      if (msg.type === "snapshot" && predicate(msg.snapshot)) {
        cleanup();
        resolve(msg);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.once("error", onError);
  });
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("condition timed out");
}
