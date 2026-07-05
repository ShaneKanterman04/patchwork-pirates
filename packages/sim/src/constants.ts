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
export const BASE_PICKUP_RADIUS = 1.2;
export const DOWNED_BLEED_OUT_S = 30;
export const REVIVE_S = 3;
export const REVIVE_RANGE = 1.2;
export const REVIVE_HP_FRACTION = 0.3;
export const PING_TTL_S = 4;
export const PING_SCAN_RADIUS = 3.5;

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
export const BUILD_DURATION_S = 45;
export const WAVE_CLEAR_SALVAGE = 8;
export const PRICE_WAVE_SCALE = 0.15;
export const BASE_REROLL_COST = 5;
export const REROLL_COST_STEP = 3;

export const CLUSTER_RADIUS = 1.3;
export const DISTANCE_PENALTY = 1.0;
export const RAFT_ATTACK_BONUS = 50;
export const ELITE_BONUS = 20;

export const AURA_RADIUS = 1.8;
export const AURA_ATTACK_SPEED_BONUS = 0.25;
export const MARK_INTERVAL_S = 12;
export const MARK_DURATION_S = 5;
export const MARK_DAMAGE_MULT = 1.4;
export const MARK_RADIUS = 5;

export const KRAKEN_HP = 1200;
export const TENTACLE_COUNT = 3;
export const TENTACLE_PHASE_S = 14;
export const HEAD_WINDOW_S = 6;
export const BETWEEN_S = 4;
export const BETWEEN_CHUM = 5;
