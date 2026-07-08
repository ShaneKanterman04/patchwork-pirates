import { startServer } from "@patchwork/server";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_E2E_SERVER_PORT = 8199;

export function e2eServerPort(): number {
  const raw = process.env.E2E_SERVER_PORT;
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_E2E_SERVER_PORT;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid E2E_SERVER_PORT: ${raw}`);
  }
  if (port === 8080) {
    throw new Error("E2E_SERVER_PORT must not be 8080.");
  }

  return port;
}

export function launchTestServer(seed: number, port = e2eServerPort()): TestServer {
  if (port === 8080) {
    throw new Error("The e2e server must not bind to port 8080.");
  }

  const handle = startServer(port, seed);
  return {
    url: `ws://localhost:${port}`,
    close: async () => {
      const closed = new Promise<void>((resolve) => {
        handle.wss.once("close", () => resolve());
      });
      handle.close();
      await closed;
    }
  };
}
