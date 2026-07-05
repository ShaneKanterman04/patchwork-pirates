export interface SfxThrottleState {
  readonly lastPlayedMs: ReadonlyMap<string, number>;
}

export interface SfxThrottleResult {
  allowed: boolean;
  state: SfxThrottleState;
}

export function createSfxThrottleState(): SfxThrottleState {
  return { lastPlayedMs: new Map() };
}

export function throttleSfx(
  state: SfxThrottleState,
  key: string,
  nowMs: number,
  minIntervalMs: number
): SfxThrottleResult {
  const previous = state.lastPlayedMs.get(key);
  if (previous !== undefined && nowMs - previous < minIntervalMs) {
    return { allowed: false, state };
  }

  const lastPlayedMs = new Map(state.lastPlayedMs);
  lastPlayedMs.set(key, nowMs);
  return { allowed: true, state: { lastPlayedMs } };
}
