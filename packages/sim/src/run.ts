import {
  BASE_REROLL_COST,
  BUILD_DURATION_S,
  MAX_ENEMIES,
  PRICE_WAVE_SCALE,
  REROLL_COST_STEP,
  SPAWN_INTERVAL_TICKS,
  TICK_RATE,
  WAVE_CLEAR_SALVAGE
} from "./constants";
import { startBoss, updateBoss } from "./boss";
import { returnDownedAndOutPlayers } from "./downed";
import { createEnemy } from "./enemies";
import { placeModule, supplyCapacity } from "./modules";
import { applyCharacterProfile } from "./player";
import { nextRandom } from "./world";
import type {
  EnemyDef,
  ItemDef,
  PlayerShop,
  PlayerState,
  RunState,
  ShopOffer,
  Vec2,
  WaveDef,
  WaveSpawnEntry,
  WeaponDef,
  WorldState
} from "./types";

const MAX_WAVES = 8;
const EDGE_SURGE_CHANCE = 0.15;

export function createRunState(): RunState {
  return {
    phase: "lobby",
    wave: 1,
    phaseTicksLeft: 0,
    budgetRemaining: 0,
    spawnTimer: 0,
    readyPlayerIds: []
  };
}

export function startRun(world: WorldState): void {
  if (world.run.phase !== "lobby") {
    return;
  }

  loadWave(world, 1);
}

export function setCharacter(
  world: WorldState,
  playerId: string,
  characterId: string
): boolean {
  if (world.run.phase !== "lobby") {
    return false;
  }

  const player = world.players.find((candidate) => candidate.id === playerId);
  const character = world.content.characters[characterId];
  if (player === undefined || character === undefined) {
    return false;
  }

  // Reset to PLAYER_* baselines inside applyCharacterProfile before applying
  // the selected stat profile, so repeated lobby selections do not stack.
  applyCharacterProfile(player, character);
  return true;
}

export function setPlayerReady(
  world: WorldState,
  playerId: string,
  ready: boolean
): void {
  if (world.run.phase !== "build") {
    return;
  }

  const readyIds = world.run.readyPlayerIds;
  const existingIndex = readyIds.indexOf(playerId);

  if (ready && existingIndex === -1) {
    readyIds.push(playerId);
  } else if (!ready && existingIndex !== -1) {
    readyIds.splice(existingIndex, 1);
  }
}

export function buyOffer(
  world: WorldState,
  playerId: string,
  index: number
): boolean {
  if (world.run.phase !== "build") {
    return false;
  }

  const player = world.players.find((candidate) => candidate.id === playerId);
  const offer = player?.shop.offers[index];
  if (player === undefined || offer === undefined || offer.kind === "sold") {
    return false;
  }

  if (player.coins < offer.price) {
    return false;
  }

  if (offer.kind === "weapon") {
    if (player.weapons.length >= 4 || world.content.weapons[offer.defId] === undefined) {
      return false;
    }

    player.coins -= offer.price;
    player.weapons.push({ defId: offer.defId, cooldownTicks: 0 });
  } else {
    const def = world.content.items[offer.defId];
    if (def === undefined) {
      return false;
    }

    player.coins -= offer.price;
    player.items.push(offer.defId);
    applyItem(player, def);
  }

  player.shop.offers[index] = { kind: "sold" };
  player.shop.locked[index] = false;
  return true;
}

export function sellWeapon(
  world: WorldState,
  playerId: string,
  index: number
): boolean {
  if (world.run.phase !== "build") {
    return false;
  }

  const player = world.players.find((candidate) => candidate.id === playerId);
  const weapon = player?.weapons[index];
  if (
    player === undefined ||
    weapon === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    player.weapons.length <= 1
  ) {
    return false;
  }

  const def = world.content.weapons[weapon.defId];
  if (def === undefined) {
    return false;
  }

  player.weapons.splice(index, 1);
  player.coins += Math.floor(def.shopPrice / 2);
  return true;
}

export function rerollShop(world: WorldState, playerId: string): boolean {
  if (world.run.phase !== "build") {
    return false;
  }

  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || player.coins < player.shop.rerollCost) {
    return false;
  }

  player.coins -= player.shop.rerollCost;
  player.shop = redrawShop(world, player.shop, false);
  player.shop.rerollCost += REROLL_COST_STEP;
  return true;
}

export function toggleLock(
  world: WorldState,
  playerId: string,
  index: number
): void {
  if (world.run.phase !== "build") {
    return;
  }

  const player = world.players.find((candidate) => candidate.id === playerId);
  if (player === undefined || index < 0 || index >= 4) {
    return;
  }

  player.shop.locked[index] = !(player.shop.locked[index] ?? false);
}

export function purchaseModule(
  world: WorldState,
  playerId: string,
  defId: string,
  col: number,
  row: number
): boolean {
  if (
    world.run.phase !== "build" ||
    !world.players.some((player) => player.id === playerId)
  ) {
    return false;
  }

  const def = world.content.modules[defId];
  if (def === undefined || world.salvage < def.salvageCost) {
    return false;
  }

  const module = placeModule(world, defId, col, row);
  if (module === null) {
    return false;
  }

  world.salvage = Math.min(supplyCapacity(world), world.salvage - def.salvageCost);
  return true;
}

export function updateRunPreSim(world: WorldState): void {
  if (world.content.waves.length === 0) {
    return;
  }

  if (world.run.phase === "combat") {
    updateCombatPhase(world);
    return;
  }

  if (world.run.phase === "build") {
    updateBuildPhase(world);
  }
}

export function updateRunPostSim(world: WorldState): void {
  if (
    world.run.phase === "victory" ||
    world.run.phase === "defeat"
  ) {
    return;
  }

  const allPlayersDownOrOut =
    world.players.length > 0 &&
    world.players.every((player) => player.downed || player.out);

  if (world.coreDestroyed || allPlayersDownOrOut) {
    world.run.phase = "defeat";
  }
}

function updateCombatPhase(world: WorldState): void {
  const waveDef = currentWaveDef(world);
  if (waveDef?.boss === "kraken") {
    if (world.boss === null) {
      startBoss(world);
    }
    updateBoss(world);
    return;
  }

  updateBudgetSpawner(world);
  world.run.phaseTicksLeft -= 1;

  const timerExpired = world.run.phaseTicksLeft <= 0;
  // Auto-clear: once nothing more can spawn AND every enemy is dead, end the
  // wave immediately rather than waiting out the timer on an empty sea.
  const clearedEarly =
    world.enemies.length === 0 && waveSpawnExhausted(world, waveDef);

  if (!timerExpired && !clearedEarly) {
    return;
  }

  endCombatWave(world);
}

function waveSpawnExhausted(world: WorldState, waveDef: WaveDef | undefined): boolean {
  if (world.run.budgetRemaining <= 0 || waveDef === undefined) {
    return true;
  }
  return !waveDef.table.some(
    (entry) => entry.weight > 0 && entry.cost <= world.run.budgetRemaining
  );
}

function endCombatWave(world: WorldState): void {
  world.enemies = [];
  world.projectiles = world.projectiles.filter(
    (projectile) => projectile.faction !== "enemy"
  );
  world.salvage = Math.min(supplyCapacity(world), world.salvage + WAVE_CLEAR_SALVAGE);
  returnDownedAndOutPlayers(world);

  if (world.run.wave >= MAX_WAVES) {
    world.run.phase = "victory";
    world.run.phaseTicksLeft = 0;
    world.run.budgetRemaining = 0;
    world.run.spawnTimer = 0;
    world.run.readyPlayerIds = [];
    return;
  }

  world.run.phase = "build";
  world.run.phaseTicksLeft = secondsToTicks(BUILD_DURATION_S);
  world.run.spawnTimer = 0;
  world.run.readyPlayerIds = [];
  generatePlayerShops(world);
}

function updateBuildPhase(world: WorldState): void {
  world.run.phaseTicksLeft -= 1;

  const allPlayersReady =
    world.players.length > 0 &&
    world.players.every((player) => world.run.readyPlayerIds.includes(player.id));

  if (world.run.phaseTicksLeft > 0 && !allPlayersReady) {
    return;
  }

  loadWave(world, world.run.wave + 1);
}

function loadWave(world: WorldState, wave: number): void {
  const waveDef = world.content.waves[wave - 1];
  if (waveDef === undefined) {
    return;
  }

  world.run.phase = "combat";
  world.run.wave = wave;
  world.run.phaseTicksLeft = secondsToTicks(waveDef.durationS);
  world.run.budgetRemaining = scaledBudget(waveDef, world);
  world.run.spawnTimer = 0;
  world.run.readyPlayerIds = [];
  if (waveDef.boss === "kraken") {
    startBoss(world);
  } else {
    world.boss = null;
  }
}

function generatePlayerShops(world: WorldState): void {
  for (const player of world.players) {
    player.shop = redrawShop(world, player.shop, true);
  }
}

function redrawShop(
  world: WorldState,
  previousShop: PlayerShop,
  resetRerollCost: boolean
): PlayerShop {
  const offers: ShopOffer[] = [];
  const locked: boolean[] = [];

  for (let index = 0; index < 4; index += 1) {
    const previousOffer = previousShop.offers[index];
    const isLocked = previousShop.locked[index] ?? false;
    const keepLocked = isLocked && previousOffer !== undefined;
    const keepSold = !resetRerollCost && previousOffer?.kind === "sold";

    offers[index] =
      keepLocked || keepSold ? previousOffer : drawShopOffer(world);
    locked[index] = keepLocked ? true : (previousShop.locked[index] ?? false);
  }

  return {
    offers,
    locked,
    rerollCost: resetRerollCost ? BASE_REROLL_COST : previousShop.rerollCost
  };
}

function drawShopOffer(world: WorldState): ShopOffer {
  const weapons = Object.values(world.content.weapons);
  const items = Object.values(world.content.items);
  const totalWeight = weapons.length + items.length;

  if (totalWeight <= 0) {
    return { kind: "sold" };
  }

  let cursor = Math.floor(nextRandom(world) * totalWeight);
  if (cursor < weapons.length) {
    const weapon = weapons[cursor] as WeaponDef;
    return {
      kind: "weapon",
      defId: weapon.id,
      price: scaledPrice(weapon.shopPrice, world.run.wave)
    };
  }

  cursor -= weapons.length;
  const item = items[cursor] as ItemDef;
  return {
    kind: "item",
    defId: item.id,
    price: scaledPrice(item.basePrice, world.run.wave)
  };
}

function scaledPrice(basePrice: number, wave: number): number {
  return Math.round(basePrice * (1 + PRICE_WAVE_SCALE * (wave - 1)));
}

function applyItem(player: PlayerState, def: ItemDef): void {
  const modifiers = def.modifiers;

  if (modifiers.maxHp !== undefined) {
    player.maxHp += modifiers.maxHp;
    player.hp += modifiers.maxHp;
  }

  player.moveSpeed += modifiers.moveSpeed ?? 0;
  player.pickupRadius += modifiers.pickupRadius ?? 0;
  player.repairSpeed += modifiers.repairSpeed ?? 0;
  player.damageMult += modifiers.damageMult ?? 0;
  player.attackSpeedMult += modifiers.attackSpeedMult ?? 0;
}

function updateBudgetSpawner(world: WorldState): void {
  world.run.spawnTimer -= 1;
  if (world.run.spawnTimer > 0) {
    return;
  }

  world.run.spawnTimer = SPAWN_INTERVAL_TICKS;

  const waveDef = currentWaveDef(world);
  if (
    waveDef === undefined ||
    world.run.budgetRemaining <= 0 ||
    world.enemies.length >= MAX_ENEMIES
  ) {
    return;
  }

  const entry = weightedSpawnEntry(world, waveDef);
  if (entry === null) {
    return;
  }

  const def = world.content.enemies[entry.enemyId];
  if (def === undefined) {
    return;
  }

  const enemy = createEnemy(world, scaledEnemyDef(def, world), spawnPosition(world));
  world.enemies.push(enemy);
  world.run.budgetRemaining -= entry.cost;
}

function weightedSpawnEntry(
  world: WorldState,
  waveDef: WaveDef
): WaveSpawnEntry | null {
  const affordable = waveDef.table.filter(
    (entry) => entry.cost <= world.run.budgetRemaining && entry.weight > 0
  );

  const totalWeight = affordable.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  let cursor = nextRandom(world) * totalWeight;
  for (const entry of affordable) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entry;
    }
  }

  return affordable[affordable.length - 1] ?? null;
}

function spawnPosition(world: WorldState): Vec2 {
  const spawnAttempt = Math.floor(world.tick / SPAWN_INTERVAL_TICKS);
  const baseEdge = spawnAttempt % 4;
  const edge =
    nextRandom(world) < EDGE_SURGE_CHANCE ? (baseEdge + 3) % 4 : baseEdge;
  const offset = nextRandom(world);

  if (edge === 0) {
    return {
      x: world.raft.minCol + offset * world.raft.width,
      y: world.raft.minRow - 1
    };
  }

  if (edge === 1) {
    return {
      x: world.raft.maxCol + 2,
      y: world.raft.minRow + offset * world.raft.height
    };
  }

  if (edge === 2) {
    return {
      x: world.raft.minCol + offset * world.raft.width,
      y: world.raft.maxRow + 2
    };
  }

  return {
    x: world.raft.minCol - 1,
    y: world.raft.minRow + offset * world.raft.height
  };
}

function scaledEnemyDef(def: EnemyDef, world: WorldState): EnemyDef {
  const hpScale = 1 + 0.3 * (playerCount(world) - 1);
  const maxHp = Math.round(def.maxHp * hpScale);

  return {
    ...def,
    maxHp
  };
}

function scaledBudget(waveDef: WaveDef, world: Pick<WorldState, "players">): number {
  return Math.round(waveDef.budget * (1 + 0.7 * (playerCount(world) - 1)));
}

function playerCount(world: Pick<WorldState, "players">): number {
  return Math.max(1, world.players.length);
}

function currentWaveDef(
  world: Pick<WorldState, "content"> & { run: Pick<RunState, "wave"> }
): WaveDef | undefined {
  return world.content.waves[world.run.wave - 1];
}

function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
