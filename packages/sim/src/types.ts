export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerId = string;

export interface PlayerInput {
  movement: Vec2;
  dash: boolean;
  interact: boolean;
}

export interface PlayerState {
  id: PlayerId;
  pos: Vec2;
  facing: Vec2;
  hp: number;
  maxHp: number;
  moveSpeed: number;
  dashCooldown: number;
  dashTicks: number;
  dashDir: Vec2;
  prevDash: boolean;
}

export interface RaftTile {
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  kind: "deck" | "core";
  broken: boolean;
}

export interface RaftState {
  width: number;
  height: number;
  tiles: RaftTile[];
}

export interface WorldState {
  tick: number;
  rngState: number;
  players: PlayerState[];
  raft: RaftState;
}
