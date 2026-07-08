import type { Scenario } from "./types";

export const soloSmoke: Scenario = {
  name: "solo-smoke",
  seed: 12_301,
  players: [{ characterId: "captain" }],
  steps: [
    { click: "[data-lobby] .lobby-actions button:first-of-type" },
    { click: "[data-lobby] .character-select button:first-of-type" },
    { click: "[data-lobby] .lobby-panel > button:first-of-type" },
    { wait: 2_000 },
    { key: "d", downMs: 700 },
    { key: "s", downMs: 450 },
    { screenshot: "in-combat" },
    { wait: 38_000 },
    { screenshot: "build-phase" }
  ]
};
