export const TICK_RATE = 30;

export const RAFT_WIDTH = 5;
export const RAFT_HEIGHT = 5;
export const TILE_MAX_HP = 100;
export const CORE_MAX_HP = 500;

export const PLAYER_MAX_HP = 100;
export const PLAYER_MOVE_SPEED = 4;
export const PLAYER_RADIUS = 0.4;

export const DASH_SPEED_MULT = 3;
export const DASH_DURATION_S = 0.2;
export const DASH_COOLDOWN_S = 3.0;
export const DASH_DURATION_TICKS = Math.round(DASH_DURATION_S * TICK_RATE);
export const DASH_COOLDOWN_TICKS = Math.round(DASH_COOLDOWN_S * TICK_RATE);
