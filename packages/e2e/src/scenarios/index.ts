import { coopSmoke } from "./coop-smoke";
import { soloSmoke } from "./solo-smoke";
import type { Scenario } from "./types";

export type { Scenario, ScenarioStep } from "./types";

export const scenarios = new Map<string, Scenario>(
  [soloSmoke, coopSmoke].map((scenario) => [scenario.name, scenario])
);
