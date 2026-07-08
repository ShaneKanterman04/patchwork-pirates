import type { Scenario } from "./types";

export const coopSmoke: Scenario = {
  name: "coop-smoke",
  seed: 22_701,
  players: [{ characterId: "captain" }, { characterId: "fisher" }],
  steps: [
    { click: "[data-lobby] .lobby-actions button:first-of-type", page: 0 },
    { click: "[data-lobby] .character-select button:first-of-type", page: 0 },
    { wait: 500 },
    { click: "[data-lobby] .character-select button:nth-of-type(2)", page: 1 },
    { wait: 500 },
    { screenshot: "lobby-two-players", page: 0 }
  ]
};
