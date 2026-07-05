import { Application, Container, Graphics, Text } from "pixi.js";
import { CHARACTERS } from "@patchwork/content";
import type {
  EnemyView,
  ModuleView,
  PickupView,
  PlayerView,
  ProjView,
  RaftView,
  WireEvent
} from "@patchwork/protocol";
import { characterColor, characterName, pingColor } from "./coOpLogic";
import type { ConnectionStatus } from "./net";
import type { InterpolatedState } from "./interp";
import type { ViewportTransform } from "./shopLogic";

export const TILE_PX = 60;

const RAFT_SIZE_TILES = 5;
const RAFT_CENTER = { x: 2.5, y: 2.5 };
const VIEW_MARGIN_TILES = 3;
const VIEW_TILES = RAFT_SIZE_TILES + VIEW_MARGIN_TILES * 2;
const PLAYER_RADIUS = 0.38;
const SLASH_DURATION_MS = 180;
const HIT_DURATION_MS = 140;
const KILL_DURATION_MS = 260;
const EXPLOSION_DURATION_MS = 360;
const PING_LIFE_MS = 3_000;

interface EntityNode {
  container: Container;
  body: Graphics;
  facing?: Graphics;
  hpBack?: Graphics;
  hpFill?: Graphics;
  label?: Text;
  reviveRing?: Graphics;
  bleedRing?: Graphics;
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
  kind: "hit" | "kill" | "explosion";
}

interface PingNode {
  graphic: Graphics;
  ageMs: number;
}

export interface HudState {
  status: ConnectionStatus;
  waveText: string;
  phaseText: string;
  coinsText: string;
  salvageText: string;
  hpText: string;
  hpRatio: number;
}

export class GameRenderer {
  private readonly world = new Container();
  private readonly raft = new Container();
  private readonly modules = new Map<string, Graphics>();
  private readonly projectiles = new Map<string, Graphics>();
  private readonly players = new Map<string, EntityNode>();
  private readonly enemies = new Map<string, EntityNode>();
  private readonly pickups = new Map<string, Graphics>();
  private readonly pings = new Map<string, PingNode>();
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
      } else if (event.type === "enemy_killed") {
        this.addPop(event.x, event.y, 0x9be7ff, KILL_DURATION_MS, "kill");
      } else if (event.type === "explosion") {
        this.addPop(event.x, event.y, 0xffb020, EXPLOSION_DURATION_MS, "explosion");
      }
    }
  }

  update(state: InterpolatedState, myPlayerId: string | undefined, deltaMs: number): void {
    this.drawRaft(state.raft);
    this.updateModules(state.modules);
    this.updateProjectiles(state.projectiles);
    this.updatePlayers(state.players, myPlayerId);
    this.updateEnemies(state.enemies);
    this.updatePickups(state.pickups);
    this.updatePings(state.pings, deltaMs);
    this.updateSlashes(deltaMs);
    this.updatePops(deltaMs);
  }

  hudState(
    state: InterpolatedState,
    myPlayerId: string | undefined,
    status: ConnectionStatus,
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
      waveText: `Wave ${state.wave.number}`,
      phaseText: phaseText(state.wave.phase, state.wave.timeLeft),
      coinsText: `Coins ${ownPlayer?.coins ?? 0}`,
      salvageText: `Salvage ${state.salvage ?? 0}`,
      hpText,
      hpRatio: clamp01(hpRatio)
    };
  }

  viewportTransform(): ViewportTransform {
    return {
      scale: this.world.scale.x,
      offsetX: this.world.position.x,
      offsetY: this.world.position.y
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

  private drawRaft(raft?: RaftView): void {
    this.raft.removeChildren();
    const tiles = raft?.tiles ?? fallbackRaft().tiles;

    for (const tileView of tiles) {
      const tile = new Graphics();
      const x = tileView.col;
      const y = tileView.row;

      if (tileView.broken) {
        tile
          .rect(x + 0.06, y + 0.06, 0.88, 0.88)
          .fill({ color: 0x317e9b, alpha: 0.72 })
          .stroke({ color: 0x8ed7ed, width: 0.025, alpha: 0.55 })
          .moveTo(x + 0.18, y + 0.54)
          .lineTo(x + 0.82, y + 0.46)
          .stroke({ color: 0xb9edf6, width: 0.025, alpha: 0.5 });
        this.raft.addChild(tile);
        continue;
      }

      const hpRatio = clamp01(tileView.hpRatio);
      const isCore = tileView.kind === "core";
      const deckColor = blendColor(isCore ? 0x7f4f1b : 0x5b3421, isCore ? 0xd9a441 : 0xb87942, hpRatio);
      tile
        .rect(x + 0.03, y + 0.03, 0.94, 0.94)
        .fill(deckColor)
        .stroke({ color: isCore ? 0xffec9f : 0x6f4425, width: isCore ? 0.055 : 0.035 });
      tile
        .moveTo(x + 0.16, y + 0.5)
        .lineTo(x + 0.84, y + 0.5)
        .stroke({ color: isCore ? 0xffd77a : 0xd79a5d, width: 0.025, alpha: 0.7 });

      if (isCore) {
        tile
          .circle(x + 0.5, y + 0.5, 0.3)
          .fill(0x7f4f1b)
          .stroke({ color: 0xffec9f, width: 0.045 })
          .roundRect(x + 0.16, y + 0.84, 0.68, 0.08, 0.025)
          .fill(0x2b1d1d)
          .roundRect(x + 0.18, y + 0.86, 0.64 * hpRatio, 0.04, 0.02)
          .fill(hpColor(hpRatio));
      }

      this.raft.addChild(tile);
    }
  }

  private updatePlayers(players: readonly PlayerView[], myPlayerId: string | undefined): void {
    const seen = new Set<string>();

    for (const player of players) {
      const isOut = player.out ?? false;
      if (isOut) {
        continue;
      }

      seen.add(player.id);
      const node = getOrCreateEntity(this.players, this.world, player.id, true);
      const isOwn = player.id === myPlayerId;
      node.container.position.set(player.x, player.y);
      node.body.clear();

      if (player.downed) {
        node.body
          .ellipse(0, 0.08, PLAYER_RADIUS * 1.2, PLAYER_RADIUS * 0.56)
          .fill(0x6d7480)
          .stroke({ color: 0xd8dde3, width: 0.045, alpha: 0.7 })
          .circle(-0.22, -0.02, 0.12)
          .fill(0x8a929c);
      } else {
        node.body
          .circle(0, 0, PLAYER_RADIUS)
          .fill(isOwn ? 0x2f80ed : characterColor(player.characterId))
          .stroke({ color: isOwn ? 0xffffff : 0x12362c, width: isOwn ? 0.075 : 0.045 });
      }

      const facing = node.facing;
      if (facing !== undefined) {
        const magnitude = Math.hypot(player.facingX, player.facingY);
        const fx = magnitude > 0 ? player.facingX / magnitude : 1;
        const fy = magnitude > 0 ? player.facingY / magnitude : 0;
        facing.clear();
        if (!player.downed) {
          facing.moveTo(0, 0).lineTo(fx * 0.58, fy * 0.58).stroke({
            color: 0xffffff,
            width: 0.07,
            cap: "round"
          });
        }
      }

      drawHpBar(node, player.maxHp > 0 ? player.hp / player.maxHp : 0);
      drawPlayerLabel(node, `${isOwn ? "You" : characterName(player.characterId, CHARACTERS)}`);
      drawDownedRings(node, player);
    }

    removeMissing(this.players, seen);
  }

  private updatePings(pings: readonly { id: string; kind: string; x: number; y: number }[], deltaMs: number): void {
    const seen = new Set<string>();

    for (const ping of pings) {
      seen.add(ping.id);
      let node = this.pings.get(ping.id);

      if (node === undefined) {
        node = { graphic: new Graphics(), ageMs: 0 };
        this.pings.set(ping.id, node);
        this.world.addChild(node.graphic);
      } else {
        node.ageMs += deltaMs;
      }

      const t = clamp01(node.ageMs / PING_LIFE_MS);
      const alpha = 1 - t;
      const radius = 0.28 + t * 0.28;
      node.graphic.position.set(ping.x, ping.y);
      node.graphic
        .clear()
        .circle(0, 0, radius)
        .stroke({ color: pingColor(ping.kind), width: 0.075, alpha })
        .moveTo(-0.16, 0)
        .lineTo(0.16, 0)
        .moveTo(0, -0.16)
        .lineTo(0, 0.16)
        .stroke({ color: pingColor(ping.kind), width: 0.045, alpha });
    }

    for (const [id, node] of this.pings) {
      if (!seen.has(id) || node.ageMs >= PING_LIFE_MS) {
        node.graphic.destroy();
        this.pings.delete(id);
      }
    }
  }

  private updateEnemies(enemies: readonly EnemyView[]): void {
    const seen = new Set<string>();

    for (const enemy of enemies) {
      seen.add(enemy.id);
      const node = getOrCreateEntity(this.enemies, this.world, enemy.id, false);
      node.container.position.set(enemy.x, enemy.y);
      drawEnemy(node.body.clear(), enemy);
      drawHpBar(node, enemy.hpRatio);
    }

    removeMissing(this.enemies, seen);
  }

  private updateModules(modules: readonly ModuleView[]): void {
    const seen = new Set<string>();

    for (const module of modules) {
      seen.add(module.id);
      let graphic = this.modules.get(module.id);

      if (graphic === undefined) {
        graphic = new Graphics();
        this.modules.set(module.id, graphic);
        this.world.addChild(graphic);
      }

      drawModule(graphic, module);
    }

    for (const [id, graphic] of this.modules) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.modules.delete(id);
      }
    }
  }

  private updateProjectiles(projectiles: readonly ProjView[]): void {
    const seen = new Set<string>();

    for (const projectile of projectiles) {
      seen.add(projectile.id);
      let graphic = this.projectiles.get(projectile.id);

      if (graphic === undefined) {
        graphic = new Graphics();
        this.projectiles.set(projectile.id, graphic);
        this.world.addChild(graphic);
      }

      const isEnemy = projectile.faction === "enemy";
      graphic.position.set(projectile.x, projectile.y);
      graphic
        .clear()
        .circle(0, 0, isEnemy ? 0.13 : 0.09)
        .fill(isEnemy ? 0x7ee36d : 0xfff2a0)
        .stroke({ color: isEnemy ? 0x245820 : 0xffffff, width: 0.025 })
        .moveTo(isEnemy ? -0.18 : -0.26, 0)
        .lineTo(0.04, 0)
        .stroke({ color: isEnemy ? 0xb9ff9e : 0xffffff, width: 0.04, alpha: 0.65 });
    }

    for (const [id, graphic] of this.projectiles) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.projectiles.delete(id);
      }
    }
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
      const radius =
        pop.kind === "hit" ? 0.12 + t * 0.22 : pop.kind === "explosion" ? 0.32 + t * 0.9 : 0.2 + t * 0.48;
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

function fallbackRaft(): RaftView {
  const tiles = [];

  for (let row = 0; row < RAFT_SIZE_TILES; row += 1) {
    for (let col = 0; col < RAFT_SIZE_TILES; col += 1) {
      tiles.push({
        col,
        row,
        kind: col === 2 && row === 2 ? ("core" as const) : ("deck" as const),
        hpRatio: 1,
        broken: false
      });
    }
  }

  return { width: RAFT_SIZE_TILES, height: RAFT_SIZE_TILES, tiles };
}

function drawEnemy(graphic: Graphics, enemy: EnemyView): void {
  const r = enemy.radius;

  if (enemy.kind === "brute_turtle") {
    graphic
      .ellipse(0, 0.04, r * 1.15, r * 0.82)
      .fill(0x4d9b60)
      .stroke({ color: 0x244629, width: 0.07 })
      .circle(r * 0.62, -r * 0.08, r * 0.28)
      .fill(0x78bd74)
      .circle(-r * 0.2, -r * 0.12, r * 0.22)
      .fill(0x2f6f3d);
    return;
  }

  if (enemy.kind === "plank_biter") {
    graphic
      .roundRect(-r * 1.25, -r * 0.42, r * 2.5, r * 0.84, r * 0.16)
      .fill(0x7b5435)
      .stroke({ color: 0x3d2617, width: 0.055 })
      .moveTo(r * 0.25, -r * 0.38)
      .lineTo(r * 0.62, 0)
      .lineTo(r * 0.25, r * 0.38)
      .stroke({ color: 0xfff2dc, width: 0.05 });
    return;
  }

  if (enemy.kind === "spitter_crab") {
    graphic
      .circle(0, 0, r)
      .fill(0xc75878)
      .stroke({ color: 0x63263d, width: 0.055 })
      .circle(0, -r * 0.15, r * 0.26)
      .fill(0xfff2dc)
      .circle(0, -r * 0.15, r * 0.11)
      .fill(0x1c1c24)
      .moveTo(-r * 1.1, r * 0.1)
      .lineTo(-r * 0.45, r * 0.25)
      .moveTo(r * 0.45, r * 0.25)
      .lineTo(r * 1.1, r * 0.1)
      .stroke({ color: 0x63263d, width: 0.05 });
    return;
  }

  graphic
    .circle(0, 0, r)
    .fill(0xde4d3a)
    .stroke({ color: 0x621e19, width: 0.055 })
    .circle(-r * 0.26, -r * 0.13, r * 0.11)
    .fill(0xfff2dc)
    .circle(r * 0.26, -r * 0.13, r * 0.11)
    .fill(0xfff2dc);
}

function drawModule(graphic: Graphics, module: ModuleView): void {
  const x = module.col + 0.5;
  const y = module.row + 0.5;
  const ratio = clamp01(module.hpRatio);
  graphic.clear();

  if (module.defId === "repair_station") {
    graphic
      .roundRect(module.col + 0.22, module.row + 0.22, 0.56, 0.56, 0.08)
      .fill(0x2aa876)
      .stroke({ color: 0xe7fff6, width: 0.04 })
      .moveTo(x - 0.16, y)
      .lineTo(x + 0.16, y)
      .moveTo(x, y - 0.16)
      .lineTo(x, y + 0.16)
      .stroke({ color: 0xe7fff6, width: 0.075, cap: "round" });
  } else {
    graphic
      .circle(x, y, 0.29)
      .fill(0x39485a)
      .stroke({ color: 0xe4edf5, width: 0.04 })
      .rect(x + 0.05, y - 0.08, 0.34, 0.16)
      .fill(0x222933)
      .stroke({ color: 0xe4edf5, width: 0.025 });
  }

  graphic
    .circle(module.col + 0.82, module.row + 0.2, 0.07)
    .fill(hpColor(ratio))
    .stroke({ color: 0x1e1e24, width: 0.02 });
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
    const label = withFacing
      ? new Text({
          text: "",
          style: {
            fill: 0xffffff,
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: 0.18,
            fontWeight: "700",
            stroke: { color: 0x102b3a, width: 0.035 }
          }
        })
      : undefined;
    const reviveRing = withFacing ? new Graphics() : undefined;
    const bleedRing = withFacing ? new Graphics() : undefined;

    container.addChild(body);
    if (reviveRing !== undefined && bleedRing !== undefined) {
      container.addChild(bleedRing, reviveRing);
    }
    if (facing !== undefined) {
      container.addChild(facing);
    }
    container.addChild(hpBack, hpFill);
    if (label !== undefined) {
      label.anchor.set(0.5, 0.5);
      container.addChild(label);
    }
    parent.addChild(container);
    node = { container, body, facing, hpBack, hpFill, label, reviveRing, bleedRing };
    map.set(id, node);
  }

  return node;
}

function drawPlayerLabel(node: EntityNode, text: string): void {
  if (node.label === undefined) {
    return;
  }

  node.label.text = text;
  node.label.position.set(0, -0.92);
}

function drawDownedRings(node: EntityNode, player: PlayerView): void {
  node.reviveRing?.clear();
  node.bleedRing?.clear();

  if (!player.downed) {
    return;
  }

  const reviveRatio = clamp01(player.reviveProgressRatio ?? 0);
  const bleedRatio = clamp01(player.bleedOutRatio ?? 0);
  drawProgressArc(node.reviveRing, 0.58, reviveRatio, 0x8fffd2, 0.08);
  drawProgressArc(node.bleedRing, 0.7, bleedRatio, 0xff6a6a, 0.06);
}

function drawProgressArc(
  graphic: Graphics | undefined,
  radius: number,
  ratio: number,
  color: number,
  width: number
): void {
  if (graphic === undefined || ratio <= 0) {
    return;
  }

  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * ratio;
  graphic.arc(0, 0, radius, start, end).stroke({ color, width, cap: "round" });
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

function blendColor(damaged: number, healthy: number, ratio: number): number {
  const r1 = (damaged >> 16) & 0xff;
  const g1 = (damaged >> 8) & 0xff;
  const b1 = damaged & 0xff;
  const r2 = (healthy >> 16) & 0xff;
  const g2 = (healthy >> 8) & 0xff;
  const b2 = healthy & 0xff;
  const red = Math.round(r1 * (1 - ratio) + r2 * ratio);
  const green = Math.round(g1 * (1 - ratio) + g2 * ratio);
  const blue = Math.round(b1 * (1 - ratio) + b2 * ratio);
  return (red << 16) + (green << 8) + blue;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function renderHud(root: HTMLElement, state: HudState): void {
  root.querySelector<HTMLElement>("[data-status]")?.replaceChildren(state.status);
  root.querySelector<HTMLElement>("[data-wave]")?.replaceChildren(state.waveText);
  root.querySelector<HTMLElement>("[data-phase]")?.replaceChildren(state.phaseText);
  root.querySelector<HTMLElement>("[data-coins]")?.replaceChildren(state.coinsText);
  root.querySelector<HTMLElement>("[data-salvage]")?.replaceChildren(state.salvageText);
  root.querySelector<HTMLElement>("[data-hp-text]")?.replaceChildren(state.hpText);

  const hpFill = root.querySelector<HTMLElement>("[data-hp-fill]");
  if (hpFill !== null) {
    hpFill.style.width = `${Math.round(state.hpRatio * 100)}%`;
    hpFill.style.background = `linear-gradient(90deg, #dc3e40, #2cbe64 ${Math.round(
      state.hpRatio * 100
    )}%)`;
  }
}

function phaseText(phase: InterpolatedState["wave"]["phase"], timeLeft: number): string {
  if (phase === "combat") {
    return timeLeft > 0 ? `Fight! ${Math.ceil(timeLeft)}s` : "Fight!";
  }

  if (phase === "build") {
    return timeLeft > 0 ? `Build ${Math.ceil(timeLeft)}s` : "Build";
  }

  return phase === "victory" ? "Victory" : "Defeat";
}
