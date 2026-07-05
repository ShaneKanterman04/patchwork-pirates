import { CONTENT, WEAPONS } from "@patchwork/content";
import {
  TICK_RATE,
  addPlayer,
  createEnemy,
  createWorld,
  setPlayerReady,
  startRun,
  tick
} from "@patchwork/sim";
import type {
  ContentRegistry,
  EnemyDef,
  PlayerInput,
  RunPhase,
  WeaponDef,
  WorldState
} from "@patchwork/sim";
import type { Bot } from "./bots";

export interface RunOptions {
  seed: number;
  characterId: string;
  extraWeapons: string[];
  bot: Bot;
}

export interface CoreHpWaveSample {
  wave: number;
  coreHp: number;
}

export interface RunResult {
  seed: number;
  outcome: Extract<RunPhase, "victory" | "defeat"> | "tick_cap";
  waveReached: number;
  ticksSurvived: number;
  coreHpAtEnd: number;
  coreHpByWave: CoreHpWaveSample[];
}

export const TICK_CAP = 40_000;

const PLAYER_ID = "harness-player";

const DUMMY_ENEMY = {
  id: "harness_dummy",
  name: "Harness Dummy",
  maxHp: 100_000,
  speedTilesPerSec: 0,
  contactDamage: 0,
  contactCooldownS: 60,
  radius: 0.35,
  coinValue: 0,
  salvageValue: 0,
  heavy: true,
  basePriority: 0,
  elite: false,
  behavior: { kind: "swarmer_melee" }
} as const satisfies EnemyDef;

export function runOne(opts: RunOptions): RunResult {
  const world = createWorld(opts.seed, CONTENT);
  const player = addPlayer(world, PLAYER_ID, opts.extraWeapons, opts.characterId);
  player.weapons = opts.extraWeapons.map((defId) => ({ defId, cooldownTicks: 0 }));
  startRun(world);

  const coreHpByWave: CoreHpWaveSample[] = [];
  let sampledWave = 0;

  while (!isTerminal(world.run.phase) && world.tick < TICK_CAP) {
    if (world.run.phase === "build") {
      setPlayerReady(world, PLAYER_ID, true);
    }

    if (world.run.phase === "combat" && world.run.wave !== sampledWave) {
      coreHpByWave.push({ wave: world.run.wave, coreHp: coreHp(world) });
      sampledWave = world.run.wave;
    }

    tick(world, new Map([[PLAYER_ID, opts.bot(world, PLAYER_ID)]]));
  }

  if (sampledWave !== world.run.wave) {
    coreHpByWave.push({ wave: world.run.wave, coreHp: coreHp(world) });
  }

  return {
    seed: opts.seed,
    outcome: terminalOutcome(world),
    waveReached: world.run.wave,
    ticksSurvived: world.tick,
    coreHpAtEnd: coreHp(world),
    coreHpByWave
  };
}

export function dpsProbe(weaponId: string): number {
  const weapon = WEAPONS[weaponId as keyof typeof WEAPONS] as WeaponDef | undefined;
  if (weapon === undefined) {
    throw new Error(`Unknown weapon: ${weaponId}`);
  }

  const content: ContentRegistry = {
    ...CONTENT,
    waves: [],
    enemies: {
      ...CONTENT.enemies,
      [DUMMY_ENEMY.id]: DUMMY_ENEMY
    }
  };
  const world = createWorld(9_001, content);
  const player = addPlayer(world, PLAYER_ID, [weaponId], "captain");
  player.weapons = [{ defId: weaponId, cooldownTicks: 0 }];
  player.pos = { x: 2.5, y: 2.5 };
  player.facing = { x: 1, y: 0 };

  const dummy = createEnemy(world, DUMMY_ENEMY, { x: 3.3, y: 2.5 });
  world.enemies.push(dummy);

  const probeTicks = TICK_RATE * 20;
  for (let index = 0; index < probeTicks; index += 1) {
    tick(world, new Map<string, PlayerInput>([[PLAYER_ID, idleInput()]]));
  }

  const damage = DUMMY_ENEMY.maxHp - dummy.hp;
  return damage / (probeTicks / TICK_RATE);
}

function idleInput(): PlayerInput {
  return {
    movement: { x: 0, y: 0 },
    dash: false,
    interact: false
  };
}

function terminalOutcome(world: WorldState): RunResult["outcome"] {
  if (world.run.phase === "victory" || world.run.phase === "defeat") {
    return world.run.phase;
  }

  return "tick_cap";
}

function isTerminal(phase: RunPhase): boolean {
  return phase === "victory" || phase === "defeat";
}

function coreHp(world: WorldState): number {
  const core = world.raft.tiles.find((tile) => tile.kind === "core");
  return core?.hp ?? 0;
}
