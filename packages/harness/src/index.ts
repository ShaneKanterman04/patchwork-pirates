import { CHARACTERS, WEAPONS } from "@patchwork/content";
import { TICK_RATE } from "@patchwork/sim";
import { BOTS, type Bot } from "./bots";
import { TICK_CAP, dpsProbe, runOne, type RunResult } from "./harness";

interface BuildDef {
  name: string;
  characterId: keyof typeof CHARACTERS;
  weapons: string[];
}

interface MatrixRow {
  build: string;
  bot: string;
  runs: RunResult[];
}

const BUILDS = [
  {
    name: "melee",
    characterId: "captain",
    weapons: ["cutlass", "cutlass", "cutlass", "cutlass"]
  },
  {
    name: "launcher",
    characterId: "captain",
    weapons: [
      "coconut_launcher",
      "coconut_launcher",
      "coconut_launcher",
      "coconut_launcher"
    ]
  },
  {
    name: "harpoon",
    characterId: "fisher",
    weapons: [
      "harpoon_gun",
      "harpoon_gun",
      "coconut_launcher",
      "coconut_launcher"
    ]
  }
] as const satisfies BuildDef[];

const BOT_MATRIX = [
  ["standAndFight", BOTS.standAndFight],
  ["kiteCircles", BOTS.kiteCircles],
  ["repairPriority", BOTS.repairPriority]
] as const satisfies readonly (readonly [string, Bot])[];

const SEEDS = [1001, 1009, 1013, 1019, 1021, 1031, 1033, 1039] as const;

export function main(): void {
  const rows: MatrixRow[] = [];

  for (const build of BUILDS) {
    for (const [botName, bot] of BOT_MATRIX) {
      const runs = SEEDS.map((seed) =>
        runOne({
          seed,
          characterId: build.characterId,
          extraWeapons: build.weapons,
          bot
        })
      );
      rows.push({ build: build.name, bot: botName, runs });
    }
  }

  printReport(rows);
}

function printReport(rows: MatrixRow[]): void {
  console.log("Patchwork Pirates balance harness");
  console.log(
    `matrix: builds=${BUILDS.length}, bots=${BOT_MATRIX.length}, seeds=${SEEDS.length}, runs=${rows.length * SEEDS.length}`
  );
  console.log(`seeds: ${SEEDS.join(", ")}`);
  console.log(`tickCap: ${TICK_CAP} (${formatSeconds(TICK_CAP)})`);
  console.log("");
  console.log("Builds");
  for (const build of BUILDS) {
    console.log(
      `${build.name.padEnd(10)} character=${build.characterId} weapons=${build.weapons.join("+")}`
    );
  }
  console.log("");
  console.log("Run aggregates");
  console.log(
    [
      "build".padEnd(10),
      "bot".padEnd(16),
      "runs".padStart(4),
      "win%".padStart(6),
      "avgWave".padStart(8),
      "medWave".padStart(8),
      "avgCore".padStart(8),
      "avgTicks".padStart(9),
      "coreHpByWave(avg)".padEnd(36),
      "outcomes"
    ].join("  ")
  );

  for (const row of rows) {
    const summary = summarize(row.runs);
    console.log(
      [
        row.build.padEnd(10),
        row.bot.padEnd(16),
        String(row.runs.length).padStart(4),
        formatNumber(summary.winRate * 100, 1).padStart(6),
        formatNumber(summary.avgWave, 2).padStart(8),
        formatNumber(summary.medianWave, 1).padStart(8),
        formatNumber(summary.avgCoreHp, 1).padStart(8),
        formatNumber(summary.avgTicks, 0).padStart(9),
        summary.coreHpCurve.padEnd(36),
        summary.outcomes
      ].join("  ")
    );
  }

  console.log("");
  console.log("Weapon DPS probe");
  console.log("weapon".padEnd(18) + "dps".padStart(8));
  for (const weaponId of Object.keys(WEAPONS)) {
    console.log(`${weaponId.padEnd(18)}${formatNumber(dpsProbe(weaponId), 2).padStart(8)}`);
  }
}

function summarize(runs: RunResult[]): {
  winRate: number;
  avgWave: number;
  medianWave: number;
  avgCoreHp: number;
  avgTicks: number;
  coreHpCurve: string;
  outcomes: string;
} {
  const waves = runs.map((run) => run.waveReached);
  const outcomes = countOutcomes(runs);

  return {
    winRate: outcomes.victory / runs.length,
    avgWave: average(waves),
    medianWave: median(waves),
    avgCoreHp: average(runs.map((run) => run.coreHpAtEnd)),
    avgTicks: average(runs.map((run) => run.ticksSurvived)),
    coreHpCurve: formatCoreCurve(runs),
    outcomes: `V:${outcomes.victory} D:${outcomes.defeat} C:${outcomes.tickCap}`
  };
}

function countOutcomes(runs: RunResult[]): {
  victory: number;
  defeat: number;
  tickCap: number;
} {
  let victory = 0;
  let defeat = 0;
  let tickCap = 0;

  for (const run of runs) {
    if (run.outcome === "victory") {
      victory += 1;
    } else if (run.outcome === "defeat") {
      defeat += 1;
    } else {
      tickCap += 1;
    }
  }

  return { victory, defeat, tickCap };
}

function formatCoreCurve(runs: RunResult[]): string {
  const maxWave = Math.max(...runs.map((run) => run.waveReached));
  const values: string[] = [];

  for (let wave = 1; wave <= maxWave; wave += 1) {
    const samples = runs.flatMap((run) =>
      run.coreHpByWave
        .filter((sample) => sample.wave === wave)
        .map((sample) => sample.coreHp)
    );
    if (samples.length > 0) {
      values.push(`w${wave}:${formatNumber(average(samples), 0)}`);
    }
  }

  return values.join(" ");
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;

  if (sorted.length % 2 === 1) {
    return upper;
  }

  const lower = sorted[mid - 1] ?? upper;
  return (lower + upper) / 2;
}

function formatSeconds(ticks: number): string {
  return `${formatNumber(ticks / TICK_RATE, 1)}s`;
}

function formatNumber(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
}

main();
