export interface Scenario {
  name: string;
  seed: number;
  players: Array<{ characterId?: string }>;
  steps: ScenarioStep[];
}

export type ScenarioStep =
  | { wait: number }
  | { key: string; page?: number; downMs?: number }
  | { click: string; page?: number }
  | { screenshot: string; page?: number };
