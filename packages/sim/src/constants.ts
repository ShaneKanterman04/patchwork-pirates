export const TICK_RATE = 30;

export const RAFT_WIDTH = 5;
export const RAFT_HEIGHT = 5;
export const TILE_MAX_HP = 100;
export const CORE_MAX_HP = 500;

export const PLAYER_MAX_HP = 100;
export const PLAYER_MOVE_SPEED = 4;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_REPAIR_RATE = 40;
export const HOLE_REBUILD_RATE = 20;
export const INTERACT_RANGE = 1.2;

export const DASH_SPEED_MULT = 3;
export const DASH_DURATION_S = 0.2;
export const DASH_COOLDOWN_S = 3.0;
export const DASH_DURATION_TICKS = Math.round(DASH_DURATION_S * TICK_RATE);
export const DASH_COOLDOWN_TICKS = Math.round(DASH_COOLDOWN_S * TICK_RATE);

// Phase-0 placeholder spawn tuning (overseer-owned; replaced by the budget-based
// wave system in Phase 1). PROVISIONAL — real feel-tuning happens once the
// client exists and Shane plays it. Smoke finding: on a confined 5x5 raft the
// one-shot cutlass clears its area as fast as chum arrive, so standing
// population stays ~3-6 regardless of spawn rate; growing a bigger kitable pack
// needs chum to survive >1 hit (a CONTENT number — deferred to the playtest).
export const SPAWN_INTERVAL_S = 0.5;
export const SPAWN_INTERVAL_TICKS = Math.round(SPAWN_INTERVAL_S * TICK_RATE);
export const MAX_ENEMIES = 24;
