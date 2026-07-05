export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  resolutionScale: number;
  particleMultiplier: number;
  enemyWakes: boolean;
  screenShake: boolean;
  enemyDeckBob: boolean;
}

export interface QualityMonitor {
  sample(frameMs: number, nowMs: number): QualityTier;
}

const SAMPLE_LIMIT = 60;
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 14;
const DROP_AFTER_MS = 2_000;
const RAISE_AFTER_MS = 10_000;
const CHANGE_COOLDOWN_MS = 1_500;
const IGNORED_FRAME_MS = 250;

const TIERS: QualityTier[] = ["low", "medium", "high"];

export function settingsForTier(tier: QualityTier): QualitySettings {
  if (tier === "high") {
    return {
      resolutionScale: 1,
      particleMultiplier: 1,
      enemyWakes: true,
      screenShake: true,
      enemyDeckBob: true
    };
  }

  if (tier === "medium") {
    return {
      resolutionScale: 0.75,
      particleMultiplier: 0.5,
      enemyWakes: false,
      screenShake: true,
      enemyDeckBob: true
    };
  }

  return {
    resolutionScale: 0.5,
    particleMultiplier: 0,
    enemyWakes: false,
    screenShake: false,
    enemyDeckBob: false
  };
}

export function createQualityMonitor(initial: QualityTier = "high"): QualityMonitor {
  const samples: number[] = [];
  let tier = initial;
  let slowSinceMs: number | undefined;
  let fastSinceMs: number | undefined;
  let cooldownUntilMs = Number.NEGATIVE_INFINITY;

  return {
    sample(frameMs: number, nowMs: number): QualityTier {
      if (frameMs > IGNORED_FRAME_MS) {
        slowSinceMs = undefined;
        fastSinceMs = undefined;
        return tier;
      }

      samples.push(frameMs);
      if (samples.length > SAMPLE_LIMIT) {
        samples.shift();
      }

      if (nowMs < cooldownUntilMs) {
        slowSinceMs = undefined;
        fastSinceMs = undefined;
        return tier;
      }

      const average = samples.reduce((total, sample) => total + sample, 0) / samples.length;

      if (average > SLOW_FRAME_MS) {
        slowSinceMs ??= nowMs;
      } else {
        slowSinceMs = undefined;
      }

      if (average < FAST_FRAME_MS) {
        fastSinceMs ??= nowMs;
      } else {
        fastSinceMs = undefined;
      }

      if (slowSinceMs !== undefined && nowMs - slowSinceMs >= DROP_AFTER_MS) {
        const nextTier = adjacentTier(tier, -1);
        if (nextTier !== tier) {
          tier = nextTier;
          cooldownUntilMs = nowMs + CHANGE_COOLDOWN_MS;
          slowSinceMs = undefined;
          fastSinceMs = undefined;
        }
        return tier;
      }

      if (fastSinceMs !== undefined && nowMs - fastSinceMs >= RAISE_AFTER_MS) {
        const nextTier = adjacentTier(tier, 1);
        if (nextTier !== tier) {
          tier = nextTier;
          cooldownUntilMs = nowMs + CHANGE_COOLDOWN_MS;
          slowSinceMs = undefined;
          fastSinceMs = undefined;
        }
      }

      return tier;
    }
  };
}

function adjacentTier(tier: QualityTier, direction: -1 | 1): QualityTier {
  const index = TIERS.indexOf(tier);
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, index + direction))]!;
}
