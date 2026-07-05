export const HINT_STORAGE_KEY = "pp_seen_hints";

export const HINT_COPY = {
  move: "Move with WASD / arrows - your weapons fight on their own!",
  dash: "Dash with Space or Shift",
  repair: "Stand near damaged raft tiles with Supplies to repair automatically",
  coins: "Coins buy weapons & items in the build shop",
  build: "Build phase - stand near a deck tile, spend Supplies on modules, then Ready Up",
  revive: "Stand next to a downed mate and hold E to revive them",
  boss: "The Kraken! Strike the head when it surfaces - heed the tile warnings"
} as const;

export type HintId = keyof typeof HINT_COPY;

export interface HintView {
  inCombat: boolean;
  combatAgeMs: number;
  nearDamagedTile: boolean;
  coinsIncreased: boolean;
  inBuildPhase: boolean;
  teammateDowned: boolean;
  bossPresent: boolean;
}

const DASH_HINT_DELAY_MS = 3_500;

export function nextHint(seen: ReadonlySet<string>, view: HintView): HintId | null {
  if (view.inCombat && !seen.has("move")) {
    return "move";
  }

  if (view.bossPresent && !seen.has("boss")) {
    return "boss";
  }

  if (view.teammateDowned && !seen.has("revive")) {
    return "revive";
  }

  if (view.nearDamagedTile && !seen.has("repair")) {
    return "repair";
  }

  if (view.coinsIncreased && !seen.has("coins")) {
    return "coins";
  }

  if (view.inBuildPhase && !seen.has("build")) {
    return "build";
  }

  if (view.inCombat && view.combatAgeMs >= DASH_HINT_DELAY_MS && !seen.has("dash")) {
    return "dash";
  }

  return null;
}

export function readSeenHints(storage: Storage | undefined = storageOrUndefined()): Set<string> {
  if (storage === undefined) {
    return new Set();
  }

  try {
    const raw = storage.getItem(HINT_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function writeSeenHints(
  seen: ReadonlySet<string>,
  storage: Storage | undefined = storageOrUndefined()
): void {
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(HINT_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Embedded/private contexts can reject localStorage; hints still work per session.
  }
}

export function resetSeenHints(storage: Storage | undefined = storageOrUndefined()): void {
  if (storage === undefined) {
    return;
  }

  try {
    storage.removeItem(HINT_STORAGE_KEY);
  } catch {
    // Ignore storage failures; reset is best-effort.
  }
}

function storageOrUndefined(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
