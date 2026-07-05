import { Application, Container, Graphics } from "pixi.js";
import type { EnemyView, PickupView, PlayerView, WireEvent } from "@patchwork/protocol";
import type { ConnectionStatus } from "./net";
import type { InterpolatedState } from "./interp";

export const TILE_PX = 60;

const RAFT_SIZE_TILES = 5;
const RAFT_CENTER = { x: 2.5, y: 2.5 };
const VIEW_MARGIN_TILES = 3;
const VIEW_TILES = RAFT_SIZE_TILES + VIEW_MARGIN_TILES * 2;
const PLAYER_RADIUS = 0.38;
const SLASH_DURATION_MS = 180;
const HIT_DURATION_MS = 140;
const KILL_DURATION_MS = 260;

interface EntityNode {
  container: Container;
  body: Graphics;
  facing?: Graphics;
  hpBack?: Graphics;
  hpFill?: Graphics;
}

interface SlashVfx {
  ageMs: number;
  graphic: Graphics;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  arcDegrees: number;
  range: number;
}

interface PopVfx {
  ageMs: number;
  durationMs: number;
  graphic: Graphics;
  x: number;
  y: number;
  color: number;
  kind: "hit" | "kill";
}

export interface HudState {
  status: ConnectionStatus;
  waveText: string;
  hpText: string;
  hpRatio: number;
}

export class GameRenderer {
  private readonly world = new Container();
  private readonly raft = new Container();
  private readonly players = new Map<string, EntityNode>();
  private readonly enemies = new Map<string, EntityNode>();
  private readonly pickups = new Map<string, Graphics>();
  private readonly slashes: SlashVfx[] = [];
  private readonly pops: PopVfx[] = [];

  private constructor(readonly app: Application) {
    app.stage.addChild(this.world);
    this.world.addChild(this.raft);
    this.drawRaft();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  static async create(parent: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      background: "#5ca9c9",
      antialias: true,
      resizeTo: window
    });
    app.canvas.className = "game-canvas";
    parent.appendChild(app.canvas);

    return new GameRenderer(app);
  }

  destroy(): void {
    window.removeEventListener("resize", this.resize);
    this.app.destroy(true);
  }

  pushEvents(events: readonly WireEvent[]): void {
    for (const event of events) {
      if (event.type === "weapon_fired") {
        const graphic = new Graphics();
        this.world.addChild(graphic);
        this.slashes.push({
          ageMs: 0,
          graphic,
          ox: event.ox,
          oy: event.oy,
          dx: event.dx,
          dy: event.dy,
          arcDegrees: event.arcDegrees,
          range: event.range
        });
      } else if (event.type === "enemy_hit") {
        this.addPop(event.x, event.y, 0xffffff, HIT_DURATION_MS, "hit");
      } else {
        this.addPop(event.x, event.y, 0x9be7ff, KILL_DURATION_MS, "kill");
      }
    }
  }

  update(state: InterpolatedState, myPlayerId: string | undefined, deltaMs: number): void {
    this.updatePlayers(state.players, myPlayerId);
    this.updateEnemies(state.enemies);
    this.updatePickups(state.pickups);
    this.updateSlashes(deltaMs);
    this.updatePops(deltaMs);
  }

  hudState(
    state: InterpolatedState,
    myPlayerId: string | undefined,
    status: ConnectionStatus,
    waveNumber: number | undefined
  ): HudState {
    const ownPlayer = state.players.find((player) => player.id === myPlayerId);
    const hpRatio =
      ownPlayer !== undefined && ownPlayer.maxHp > 0 ? ownPlayer.hp / ownPlayer.maxHp : 0;
    const hpText =
      ownPlayer === undefined
        ? "HP --"
        : `HP ${Math.max(0, Math.ceil(ownPlayer.hp))}/${Math.ceil(ownPlayer.maxHp)}`;

    return {
      status,
      waveText: `Wave ${waveNumber ?? 1}`,
      hpText,
      hpRatio: clamp01(hpRatio)
    };
  }

  private readonly resize = (): void => {
    const fitTilePx = Math.max(
      36,
      Math.min(TILE_PX, window.innerWidth / VIEW_TILES, window.innerHeight / VIEW_TILES)
    );
    this.world.scale.set(fitTilePx);
    this.world.position.set(
      window.innerWidth / 2 - RAFT_CENTER.x * fitTilePx,
      window.innerHeight / 2 - RAFT_CENTER.y * fitTilePx
    );
  };

  private drawRaft(): void {
    this.raft.removeChildren();

    for (let y = 0; y < RAFT_SIZE_TILES; y += 1) {
      for (let x = 0; x < RAFT_SIZE_TILES; x += 1) {
        const isCore = x === 2 && y === 2;
        const tile = new Graphics();
        tile
          .rect(x + 0.03, y + 0.03, 0.94, 0.94)
          .fill(isCore ? 0xd9a441 : 0xb87942)
          .stroke({ color: isCore ? 0x7b4b18 : 0x6f4425, width: 0.035 });
        tile
          .moveTo(x + 0.16, y + 0.5)
          .lineTo(x + 0.84, y + 0.5)
          .stroke({ color: isCore ? 0xffd77a : 0xd79a5d, width: 0.025, alpha: 0.7 });
        this.raft.addChild(tile);
      }
    }

    // Phase 0 snapshots do not include raft tile state; Phase 1 will replace this static deck.
    const coreMark = new Graphics();
    coreMark.circle(2.5, 2.5, 0.28).fill(0x7f4f1b).stroke({ color: 0xffec9f, width: 0.04 });
    this.raft.addChild(coreMark);
  }

  private updatePlayers(players: readonly PlayerView[], myPlayerId: string | undefined): void {
    const seen = new Set<string>();

    for (const player of players) {
      seen.add(player.id);
      const node = getOrCreateEntity(this.players, this.world, player.id, true);
      const isOwn = player.id === myPlayerId;
      node.container.position.set(player.x, player.y);
      node.body
        .clear()
        .circle(0, 0, PLAYER_RADIUS)
        .fill(player.downed ? 0x6d7480 : isOwn ? 0x2f80ed : 0x20b486)
        .stroke({ color: isOwn ? 0xffffff : 0x12362c, width: isOwn ? 0.075 : 0.045 });

      const facing = node.facing;
      if (facing !== undefined) {
        const magnitude = Math.hypot(player.facingX, player.facingY);
        const fx = magnitude > 0 ? player.facingX / magnitude : 1;
        const fy = magnitude > 0 ? player.facingY / magnitude : 0;
        facing.clear().moveTo(0, 0).lineTo(fx * 0.58, fy * 0.58).stroke({
          color: 0xffffff,
          width: 0.07,
          cap: "round"
        });
      }

      drawHpBar(node, player.hp / player.maxHp);
    }

    removeMissing(this.players, seen);
  }

  private updateEnemies(enemies: readonly EnemyView[]): void {
    const seen = new Set<string>();

    for (const enemy of enemies) {
      seen.add(enemy.id);
      const node = getOrCreateEntity(this.enemies, this.world, enemy.id, false);
      node.container.position.set(enemy.x, enemy.y);
      node.body
        .clear()
        .circle(0, 0, enemy.radius)
        .fill(0xde4d3a)
        .stroke({ color: 0x621e19, width: 0.055 })
        .circle(-enemy.radius * 0.28, -enemy.radius * 0.15, enemy.radius * 0.12)
        .fill(0xfff2dc)
        .circle(enemy.radius * 0.28, -enemy.radius * 0.15, enemy.radius * 0.12)
        .fill(0xfff2dc);
      drawHpBar(node, enemy.hpRatio);
    }

    removeMissing(this.enemies, seen);
  }

  private updatePickups(pickups: readonly PickupView[]): void {
    const seen = new Set<string>();

    for (const pickup of pickups) {
      seen.add(pickup.id);
      let graphic = this.pickups.get(pickup.id);

      if (graphic === undefined) {
        graphic = new Graphics();
        this.pickups.set(pickup.id, graphic);
        this.world.addChild(graphic);
      }

      graphic.position.set(pickup.x, pickup.y);
      graphic
        .clear()
        .circle(0, 0, 0.16)
        .fill(pickup.kind === "coin" ? 0xffcf33 : 0xf3f0a5)
        .stroke({ color: 0x8f6400, width: 0.035 });
    }

    for (const [id, graphic] of this.pickups) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.pickups.delete(id);
      }
    }
  }

  private updateSlashes(deltaMs: number): void {
    for (let index = this.slashes.length - 1; index >= 0; index -= 1) {
      const slash = this.slashes[index]!;
      slash.ageMs += deltaMs;

      if (slash.ageMs >= SLASH_DURATION_MS) {
        slash.graphic.destroy();
        this.slashes.splice(index, 1);
        continue;
      }

      drawSlash(slash);
    }
  }

  private updatePops(deltaMs: number): void {
    for (let index = this.pops.length - 1; index >= 0; index -= 1) {
      const pop = this.pops[index]!;
      pop.ageMs += deltaMs;

      if (pop.ageMs >= pop.durationMs) {
        pop.graphic.destroy();
        this.pops.splice(index, 1);
        continue;
      }

      const t = pop.ageMs / pop.durationMs;
      const radius = pop.kind === "hit" ? 0.12 + t * 0.22 : 0.2 + t * 0.48;
      pop.graphic.position.set(pop.x, pop.y);
      pop.graphic
        .clear()
        .circle(0, 0, radius)
        .stroke({ color: pop.color, width: 0.05, alpha: 1 - t });
    }
  }

  private addPop(
    x: number,
    y: number,
    color: number,
    durationMs: number,
    kind: PopVfx["kind"]
  ): void {
    const graphic = new Graphics();
    this.world.addChild(graphic);
    this.pops.push({ ageMs: 0, durationMs, graphic, x, y, color, kind });
  }
}

function getOrCreateEntity(
  map: Map<string, EntityNode>,
  parent: Container,
  id: string,
  withFacing: boolean
): EntityNode {
  let node = map.get(id);

  if (node === undefined) {
    const container = new Container();
    const body = new Graphics();
    const hpBack = new Graphics();
    const hpFill = new Graphics();
    const facing = withFacing ? new Graphics() : undefined;

    container.addChild(body);
    if (facing !== undefined) {
      container.addChild(facing);
    }
    container.addChild(hpBack, hpFill);
    parent.addChild(container);
    node = { container, body, facing, hpBack, hpFill };
    map.set(id, node);
  }

  return node;
}

function drawHpBar(node: EntityNode, ratio: number): void {
  const clamped = clamp01(ratio);
  const color = hpColor(clamped);
  node.hpBack?.clear().roundRect(-0.42, -0.68, 0.84, 0.11, 0.03).fill(0x2b1d1d);
  node.hpFill
    ?.clear()
    .roundRect(-0.4, -0.66, 0.8 * clamped, 0.07, 0.025)
    .fill(color);
}

function removeMissing(map: Map<string, EntityNode>, seen: ReadonlySet<string>): void {
  for (const [id, node] of map) {
    if (!seen.has(id)) {
      node.container.destroy({ children: true });
      map.delete(id);
    }
  }
}

function drawSlash(slash: SlashVfx): void {
  const t = slash.ageMs / SLASH_DURATION_MS;
  const direction = Math.atan2(slash.dy, slash.dx);
  const halfArc = (slash.arcDegrees * Math.PI) / 360;
  const start = direction - halfArc;
  const end = direction + halfArc;
  const steps = 12;

  slash.graphic.position.set(slash.ox, slash.oy);
  slash.graphic.clear().moveTo(0, 0);

  for (let step = 0; step <= steps; step += 1) {
    const angle = start + (end - start) * (step / steps);
    slash.graphic.lineTo(Math.cos(angle) * slash.range, Math.sin(angle) * slash.range);
  }

  slash.graphic
    .lineTo(0, 0)
    .fill({ color: 0xfff2a0, alpha: (1 - t) * 0.42 })
    .stroke({ color: 0xffffff, width: 0.05, alpha: 1 - t });
}

function hpColor(ratio: number): number {
  const red = Math.round(220 * (1 - ratio) + 44 * ratio);
  const green = Math.round(62 * (1 - ratio) + 190 * ratio);
  return (red << 16) + (green << 8) + 64;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function renderHud(root: HTMLElement, state: HudState): void {
  root.querySelector<HTMLElement>("[data-status]")?.replaceChildren(state.status);
  root.querySelector<HTMLElement>("[data-wave]")?.replaceChildren(state.waveText);
  root.querySelector<HTMLElement>("[data-hp-text]")?.replaceChildren(state.hpText);

  const hpFill = root.querySelector<HTMLElement>("[data-hp-fill]");
  if (hpFill !== null) {
    hpFill.style.width = `${Math.round(state.hpRatio * 100)}%`;
    hpFill.style.background = `linear-gradient(90deg, #dc3e40, #2cbe64 ${Math.round(
      state.hpRatio * 100
    )}%)`;
  }
}
