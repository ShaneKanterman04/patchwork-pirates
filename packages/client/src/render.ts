import { Application, Container, Graphics, Text } from "pixi.js";
import { CHARACTERS, ENEMIES } from "@patchwork/content";
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
import { enemyBobOffset, isEnemyOnDeck } from "./enemyGrounding";
import { particleBurst, popScale, shake } from "./feedback";
import type { ParticleSpec } from "./feedback";
import type { ConnectionStatus } from "./net";
import { detectCollectedPickups } from "./pickupJuice";
import type { CollectedPickup } from "./pickupJuice";
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
const HIT_FLASH_MS = 130;
const HIT_REACTION_MS = 150;
const PLAYER_HURT_FLASH_MS = 180;
const PICKUP_FLY_MS = 320;

interface EntityNode {
  container: Container;
  ground: Graphics;
  body: Graphics;
  facing?: Graphics;
  hpBack?: Graphics;
  hpFill?: Graphics;
  label?: Text;
  reviveRing?: Graphics;
  bleedRing?: Graphics;
  flash?: Graphics;
  flashMs: number;
  reactionMs: number;
  reactionDx: number;
  reactionDy: number;
  baseScale: number;
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
  kind: "hit" | "kill" | "explosion" | "splash";
}

interface PingNode {
  graphic: Graphics;
  ageMs: number;
}

interface ParticleVfx extends ParticleSpec {
  ageMs: number;
  graphic: Graphics;
}

interface PickupFlyVfx {
  ageMs: number;
  graphic: Graphics;
  kind: string;
  x: number;
  y: number;
  ownerX: number;
  ownerY: number;
}

interface PickupRecord {
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface HudState {
  status: ConnectionStatus;
  waveText: string;
  phaseText: string;
  coinsText: string;
  salvageText: string;
  hpText: string;
  hpRatio: number;
  boss:
    | {
        name: string;
        phaseText: string;
        hpRatio: number;
      }
    | null;
}

export class GameRenderer {
  private readonly world = new Container();
  private readonly raft = new Container();
  private readonly modules = new Map<string, Graphics>();
  private readonly projectiles = new Map<string, Graphics>();
  private readonly players = new Map<string, EntityNode>();
  private readonly enemies = new Map<string, EntityNode>();
  private readonly pickups = new Map<string, Graphics>();
  private readonly telegraphs = new Map<string, Graphics>();
  private readonly pings = new Map<string, PingNode>();
  private readonly slashes: SlashVfx[] = [];
  private readonly pops: PopVfx[] = [];
  private readonly particles: ParticleVfx[] = [];
  private readonly pickupFlies: PickupFlyVfx[] = [];
  private readonly enemyKinds = new Map<string, string>();
  private readonly previousEnemyDeckState = new Map<string, boolean>();
  private readonly previousPlayerHp = new Map<string, number>();
  private previousPickups: PickupRecord[] = [];
  private shakeAgeMs = Number.POSITIVE_INFINITY;
  private shakeAmplitude = 0;
  private baseWorldX = 0;
  private baseWorldY = 0;
  private renderClockMs = 0;

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
        this.flashEnemy(event.enemyId, event.x, event.y);
        this.addPop(event.x, event.y, 0xffffff, HIT_DURATION_MS, "hit");
        if (this.isBossEnemy(event.enemyId)) {
          this.addShake(0.055);
        }
      } else if (event.type === "enemy_killed") {
        this.addPop(event.x, event.y, 0x9be7ff, KILL_DURATION_MS, "kill");
        this.addParticles("kill", event.x, event.y);
      } else if (event.type === "explosion") {
        this.addPop(event.x, event.y, 0xffb020, EXPLOSION_DURATION_MS, "explosion");
        this.addParticles("explosion", event.x, event.y);
        this.addShake(0.085);
      } else if (event.type === "tile_broken") {
        this.addShake(0.045);
      } else if (event.type === "core_destroyed") {
        this.addShake(0.11);
      }
    }
  }

  update(
    state: InterpolatedState,
    myPlayerId: string | undefined,
    deltaMs: number
  ): CollectedPickup[] {
    this.renderClockMs += deltaMs;
    this.drawRaft(state.raft);
    this.updateTelegraphs(state.enemies);
    this.updateModules(state.modules);
    this.updateProjectiles(state.projectiles);
    this.updatePlayers(state.players, myPlayerId, deltaMs);
    this.updateEnemies(state.enemies, state.raft, deltaMs);
    this.updatePickups(state.pickups);
    const collectedPickups = this.updatePickupCollection(state.pickups, state.players);
    this.updatePings(state.pings, deltaMs);
    this.updateSlashes(deltaMs);
    this.updatePops(deltaMs);
    this.updateParticles(deltaMs);
    this.updatePickupFlies(deltaMs);
    this.updateShake(deltaMs);
    return collectedPickups;
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
      waveText:
        state.boss === null || state.boss === undefined
          ? `Wave ${state.wave.number}`
          : `Wave ${state.wave.number} - Boss`,
      phaseText: phaseText(state.wave.phase, state.wave.timeLeft),
      coinsText: `Coins ${ownPlayer?.coins ?? 0}`,
      salvageText: `Salvage ${state.salvage ?? 0}`,
      hpText,
      hpRatio: clamp01(hpRatio),
      boss:
        state.boss === null || state.boss === undefined
          ? null
          : {
              name: "The Kraken",
              phaseText: bossPhaseText(state.boss.phase),
              hpRatio: clamp01(state.boss.hpRatio)
            }
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
    this.baseWorldX = window.innerWidth / 2 - RAFT_CENTER.x * fitTilePx;
    this.baseWorldY = window.innerHeight / 2 - RAFT_CENTER.y * fitTilePx;
    this.world.position.set(this.baseWorldX, this.baseWorldY);
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

  private updatePlayers(
    players: readonly PlayerView[],
    myPlayerId: string | undefined,
    deltaMs: number
  ): void {
    const seen = new Set<string>();

    for (const player of players) {
      const isOut = player.out ?? false;
      if (isOut) {
        continue;
      }

      seen.add(player.id);
      const node = getOrCreateEntity(this.players, this.world, player.id, true);
      node.flashMs = Math.max(0, node.flashMs - deltaMs);
      node.reactionMs = Math.max(0, node.reactionMs - deltaMs);
      const isOwn = player.id === myPlayerId;
      const previousHp = this.previousPlayerHp.get(player.id);
      if (previousHp !== undefined && player.hp < previousHp) {
        node.flashMs = PLAYER_HURT_FLASH_MS;
      }
      this.previousPlayerHp.set(player.id, player.hp);
      node.container.position.set(player.x, player.y);
      node.container.scale.set(popScale(node.flashMs, PLAYER_HURT_FLASH_MS, 0.1) * node.baseScale);
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
      drawEntityFlash(node, player.downed ? 0xffb0b0 : 0xff5555, PLAYER_RADIUS * 1.05);
    }

    removeMissing(this.players, seen);
    for (const id of this.previousPlayerHp.keys()) {
      if (!seen.has(id)) {
        this.previousPlayerHp.delete(id);
      }
    }
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

  private updateEnemies(
    enemies: readonly EnemyView[],
    raft: RaftView | undefined,
    deltaMs: number
  ): void {
    const seen = new Set<string>();

    for (const enemy of enemies) {
      seen.add(enemy.id);
      const node = getOrCreateEntity(this.enemies, this.world, enemy.id, false);
      const onDeck = isEnemyOnDeck(raft, enemy.x, enemy.y);
      const wasOnDeck = this.previousEnemyDeckState.get(enemy.id);
      if (onDeck && wasOnDeck === false) {
        this.addPop(enemy.x, enemy.y + enemy.radius * 0.2, 0xcdf8ff, 240, "splash");
      }
      this.previousEnemyDeckState.set(enemy.id, onDeck);
      node.flashMs = Math.max(0, node.flashMs - deltaMs);
      node.reactionMs = Math.max(0, node.reactionMs - deltaMs);
      this.enemyKinds.set(enemy.id, enemy.kind);
      const reactionT = clamp01(1 - node.reactionMs / HIT_REACTION_MS);
      const nudge = Math.sin(Math.PI * reactionT) * 0.1;
      node.container.position.set(
        enemy.x + node.reactionDx * nudge,
        enemy.y + node.reactionDy * nudge
      );
      node.container.scale.set(popScale(node.reactionMs, HIT_REACTION_MS, 0.16) * node.baseScale);
      const bobY = onDeck ? enemyBobOffset(enemy.id, this.renderClockMs) : 0;
      node.body.position.set(0, bobY);
      node.flash?.position.set(0, bobY);
      drawEnemyGround(node.ground.clear(), enemy, onDeck, this.renderClockMs);
      drawEnemy(node.body.clear(), enemy);
      drawHpBar(
        node,
        enemy.hpRatio,
        -Math.max(0.58, enemy.radius + 0.2),
        Math.max(0.78, Math.min(1.35, enemy.radius * 1.9))
      );
      drawEnemyLabel(node, enemy);
      drawEntityFlash(node, 0xffffff, Math.max(0.34, enemy.radius * 1.25));
    }

    removeMissing(this.enemies, seen);
    for (const id of this.enemyKinds.keys()) {
      if (!seen.has(id)) {
        this.enemyKinds.delete(id);
        this.previousEnemyDeckState.delete(id);
      }
    }
  }

  private updateTelegraphs(enemies: readonly EnemyView[]): void {
    const byTile = new Map<string, { col: number; row: number; ratio: number }>();

    for (const enemy of enemies) {
      if (enemy.telegraph === undefined) {
        continue;
      }

      const key = `${enemy.telegraph.col},${enemy.telegraph.row}`;
      const ratio = clamp01(enemy.telegraph.ratio);
      const existing = byTile.get(key);

      if (existing === undefined || ratio < existing.ratio) {
        byTile.set(key, {
          col: enemy.telegraph.col,
          row: enemy.telegraph.row,
          ratio
        });
      }
    }

    for (const [key, telegraph] of byTile) {
      let graphic = this.telegraphs.get(key);

      if (graphic === undefined) {
        graphic = new Graphics();
        this.telegraphs.set(key, graphic);
        this.world.addChild(graphic);
      }

      drawTelegraph(graphic, telegraph.col, telegraph.row, telegraph.ratio);
    }

    for (const [key, graphic] of this.telegraphs) {
      if (!byTile.has(key)) {
        graphic.destroy();
        this.telegraphs.delete(key);
      }
    }
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
        pop.kind === "hit"
          ? 0.12 + t * 0.22
          : pop.kind === "explosion"
            ? 0.32 + t * 0.9
            : pop.kind === "splash"
              ? 0.16 + t * 0.36
              : 0.2 + t * 0.48;
      pop.graphic.position.set(pop.x, pop.y);
      pop.graphic
        .clear()
        .circle(0, 0, radius)
        .stroke({ color: pop.color, width: pop.kind === "splash" ? 0.04 : 0.05, alpha: 1 - t });
      if (pop.kind === "splash") {
        pop.graphic
          .moveTo(-radius * 0.62, 0.04)
          .lineTo(-radius * 0.28, -0.08)
          .moveTo(radius * 0.28, -0.08)
          .lineTo(radius * 0.62, 0.04)
          .stroke({ color: 0xffffff, width: 0.025, alpha: (1 - t) * 0.75, cap: "round" });
      }
    }
  }

  private updateParticles(deltaMs: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.ageMs += deltaMs;

      if (particle.ageMs >= particle.lifeMs) {
        particle.graphic.destroy();
        this.particles.splice(index, 1);
        continue;
      }

      const t = particle.ageMs / particle.lifeMs;
      const x = particle.x + particle.vx * t;
      const y = particle.y + particle.vy * t + t * t * 0.22;
      drawParticle(particle.graphic, particle, x, y, 1 - t);
    }
  }

  private updatePickupFlies(deltaMs: number): void {
    for (let index = this.pickupFlies.length - 1; index >= 0; index -= 1) {
      const fly = this.pickupFlies[index]!;
      fly.ageMs += deltaMs;

      if (fly.ageMs >= PICKUP_FLY_MS) {
        fly.graphic.destroy();
        this.pickupFlies.splice(index, 1);
        continue;
      }

      const t = easeOutCubic(clamp01(fly.ageMs / PICKUP_FLY_MS));
      const x = fly.x + (fly.ownerX - fly.x) * t;
      const y = fly.y + (fly.ownerY - fly.y) * t - Math.sin(Math.PI * t) * 0.25;
      fly.graphic.position.set(x, y);
      fly.graphic
        .clear()
        .circle(0, 0, 0.12 + Math.sin(Math.PI * t) * 0.05)
        .fill(fly.kind === "coin" ? 0xffcf33 : 0xf3f0a5)
        .stroke({ color: 0xffffff, width: 0.03, alpha: 1 - t * 0.4 })
        .moveTo(-0.22, 0)
        .lineTo(0.22, 0)
        .moveTo(0, -0.22)
        .lineTo(0, 0.22)
        .stroke({ color: 0xffffff, width: 0.025, alpha: 1 - t });
    }
  }

  private updateShake(deltaMs: number): void {
    this.shakeAgeMs += deltaMs;
    const offset = shake(this.shakeAmplitude, this.shakeAgeMs);
    const scale = this.world.scale.x;
    this.world.position.set(this.baseWorldX + offset.dx * scale, this.baseWorldY + offset.dy * scale);
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

  private addParticles(kind: "kill" | "explosion" | "pickup", x: number, y: number): void {
    for (const spec of particleBurst(kind, x, y)) {
      const graphic = new Graphics();
      this.world.addChild(graphic);
      this.particles.push({ ...spec, ageMs: 0, graphic });
    }
  }

  private addPickupFly(pickup: CollectedPickup): void {
    const graphic = new Graphics();
    this.world.addChild(graphic);
    this.pickupFlies.push({
      ageMs: 0,
      graphic,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
      ownerX: pickup.ownerX,
      ownerY: pickup.ownerY
    });
    this.addParticles("pickup", pickup.x, pickup.y);
  }

  private updatePickupCollection(
    pickups: readonly PickupView[],
    players: readonly PlayerView[]
  ): CollectedPickup[] {
    const collected = detectCollectedPickups(this.previousPickups, pickups, players);
    for (const pickup of collected) {
      this.addPickupFly(pickup);
    }
    this.previousPickups = pickups.map((pickup) => ({ ...pickup }));
    return collected;
  }

  private flashEnemy(enemyId: string, x: number, y: number): void {
    const node = this.enemies.get(enemyId);
    if (node === undefined) {
      return;
    }

    const dx = node.container.position.x - x;
    const dy = node.container.position.y - y;
    const mag = Math.hypot(dx, dy);
    node.flashMs = HIT_FLASH_MS;
    node.reactionMs = HIT_REACTION_MS;
    node.reactionDx = mag > 0.001 ? dx / mag : 0.7;
    node.reactionDy = mag > 0.001 ? dy / mag : -0.35;
  }

  private addShake(amplitude: number): void {
    this.shakeAmplitude = Math.max(this.shakeAmplitude * 0.7, amplitude);
    this.shakeAgeMs = 0;
  }

  private isBossEnemy(enemyId: string): boolean {
    return this.enemyKinds.get(enemyId)?.startsWith("kraken_") ?? false;
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

  if (enemy.kind === "kraken_tentacle") {
    const height = Math.max(1.35, r * 3.2);
    const width = Math.max(0.55, r * 1.35);
    graphic
      .ellipse(0, height * 0.28, width * 0.62, height * 0.62)
      .fill(0x4b185f)
      .stroke({ color: 0xf0a8ff, width: 0.065, alpha: 0.9 })
      .ellipse(-width * 0.12, height * 0.02, width * 0.48, height * 0.72)
      .fill(0x6a2580)
      .stroke({ color: 0x2a0d39, width: 0.085 })
      .ellipse(width * 0.12, -height * 0.34, width * 0.34, height * 0.46)
      .fill(0x7d3297)
      .moveTo(-width * 0.24, -height * 0.58)
      .lineTo(width * 0.14, -height * 0.74)
      .lineTo(width * 0.3, -height * 0.42)
      .stroke({ color: 0xf7c2ff, width: 0.06, alpha: 0.72 })
      .circle(-width * 0.2, height * 0.02, width * 0.11)
      .fill(0xd7a1e8)
      .circle(width * 0.18, height * 0.22, width * 0.1)
      .fill(0xd7a1e8);
    return;
  }

  if (enemy.kind === "kraken_head") {
    const headR = Math.max(1.05, r * 1.45);
    graphic
      .ellipse(0, 0.06, headR * 1.18, headR)
      .fill(0x39204f)
      .stroke({ color: 0x130820, width: 0.1 })
      .ellipse(-headR * 0.38, -headR * 0.2, headR * 0.24, headR * 0.16)
      .fill(0xffe676)
      .circle(-headR * 0.32, -headR * 0.2, headR * 0.07)
      .fill(0x18121c)
      .ellipse(headR * 0.38, -headR * 0.2, headR * 0.24, headR * 0.16)
      .fill(0xffe676)
      .circle(headR * 0.32, -headR * 0.2, headR * 0.07)
      .fill(0x18121c)
      .roundRect(-headR * 0.44, headR * 0.28, headR * 0.88, headR * 0.18, headR * 0.05)
      .fill(0x160d1f)
      .moveTo(-headR * 0.3, headR * 0.29)
      .lineTo(-headR * 0.18, headR * 0.48)
      .lineTo(-headR * 0.06, headR * 0.29)
      .lineTo(headR * 0.06, headR * 0.48)
      .lineTo(headR * 0.18, headR * 0.29)
      .lineTo(headR * 0.3, headR * 0.48)
      .stroke({ color: 0xfff2dc, width: 0.045 });
    return;
  }

  if (enemy.kind === "brute_turtle") {
    graphic
      .ellipse(0, 0.04, r * 1.15, r * 0.82)
      .fill(0x1f5d3a)
      .stroke({ color: 0xd8f2a4, width: 0.07 })
      .moveTo(-r * 0.68, -r * 0.05)
      .lineTo(r * 0.68, -r * 0.05)
      .moveTo(-r * 0.34, -r * 0.46)
      .lineTo(-r * 0.1, r * 0.48)
      .moveTo(r * 0.34, -r * 0.46)
      .lineTo(r * 0.1, r * 0.48)
      .stroke({ color: 0x96c56a, width: 0.035, alpha: 0.9 })
      .circle(r * 0.62, -r * 0.08, r * 0.28)
      .fill(0x5fae55)
      .stroke({ color: 0x173822, width: 0.035 })
      .circle(-r * 0.2, -r * 0.12, r * 0.22)
      .fill(0x173822);
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
      .ellipse(0, 0.05, r * 1.05, r * 0.78)
      .fill(0xe66b2e)
      .stroke({ color: 0x6f2d16, width: 0.055 })
      .circle(-r * 0.28, -r * 0.28, r * 0.16)
      .fill(0xfff2dc)
      .circle(r * 0.28, -r * 0.28, r * 0.16)
      .fill(0xfff2dc)
      .circle(-r * 0.28, -r * 0.28, r * 0.07)
      .fill(0x1c1c24)
      .circle(r * 0.28, -r * 0.28, r * 0.07)
      .fill(0x1c1c24)
      .moveTo(-r * 0.7, r * 0.1)
      .lineTo(-r * 1.25, -r * 0.18)
      .lineTo(-r * 1.45, r * 0.05)
      .moveTo(r * 0.7, r * 0.1)
      .lineTo(r * 1.25, -r * 0.18)
      .lineTo(r * 1.45, r * 0.05)
      .moveTo(-r * 0.58, r * 0.28)
      .lineTo(-r * 1.05, r * 0.52)
      .moveTo(r * 0.58, r * 0.28)
      .lineTo(r * 1.05, r * 0.52)
      .stroke({ color: 0x6f2d16, width: 0.05, cap: "round" });
    return;
  }

  graphic
    .ellipse(0, 0, r * 1.08, r * 0.78)
    .fill(0x22a7a6)
    .stroke({ color: 0x08464b, width: 0.055 })
    .moveTo(-r * 1.0, 0)
    .lineTo(-r * 1.42, -r * 0.35)
    .lineTo(-r * 1.42, r * 0.35)
    .lineTo(-r * 1.0, 0)
    .fill(0x147b82)
    .stroke({ color: 0x08464b, width: 0.04 })
    .circle(r * 0.34, -r * 0.14, r * 0.11)
    .fill(0xfff2dc)
    .circle(r * 0.38, -r * 0.14, r * 0.045)
    .fill(0x102b3a);
}

function drawEnemyGround(
  graphic: Graphics,
  enemy: EnemyView,
  onDeck: boolean,
  timeMs: number
): void {
  const r = enemy.radius;

  if (onDeck) {
    graphic
      .ellipse(0, Math.max(0.16, r * 0.42), Math.max(0.24, r * 0.95), Math.max(0.1, r * 0.28))
      .fill({ color: 0x1b1712, alpha: 0.28 });
    return;
  }

  const phase = (timeMs * 0.002 + (enemy.id.length % 7) * 0.19) % 1;
  const rearX = -Math.max(0.18, r * 0.62);
  const rearY = Math.max(0.1, r * 0.26);
  const width = Math.max(0.28, r * (0.72 + phase * 0.3));
  const alpha = 0.32 * (1 - phase * 0.45);

  graphic
    .arc(rearX, rearY, width, Math.PI * 1.08, Math.PI * 1.86)
    .stroke({ color: 0xd9fbff, width: 0.035, alpha, cap: "round" })
    .arc(rearX + r * 0.28, rearY + r * 0.16, width * 0.72, Math.PI * 1.12, Math.PI * 1.78)
    .stroke({ color: 0xffffff, width: 0.025, alpha: alpha * 0.72, cap: "round" });
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

function drawTelegraph(
  graphic: Graphics,
  col: number,
  row: number,
  remainingRatio: number
): void {
  const fillRatio = 1 - clamp01(remainingRatio);
  const cx = col + 0.5;
  const cy = row + 0.5;
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * fillRatio;

  graphic
    .clear()
    .rect(col + 0.08, row + 0.08, 0.84, 0.84)
    .fill({ color: 0xff2e2e, alpha: 0.16 + fillRatio * 0.2 })
    .stroke({ color: 0xffe0a3, width: 0.035, alpha: 0.82 })
    .circle(cx, cy, 0.36)
    .stroke({ color: 0xff2e2e, width: 0.075, alpha: 0.95 });

  if (fillRatio > 0) {
    graphic
      .moveTo(cx, cy)
      .arc(cx, cy, 0.3, start, end)
      .lineTo(cx, cy)
      .fill({ color: 0xff2e2e, alpha: 0.48 });
  }

  graphic
    .moveTo(cx - 0.28, cy)
    .lineTo(cx + 0.28, cy)
    .moveTo(cx, cy - 0.28)
    .lineTo(cx, cy + 0.28)
    .stroke({ color: 0xffffff, width: 0.035, alpha: 0.72 });
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
    const ground = new Graphics();
    const body = new Graphics();
    const flash = new Graphics();
    const hpBack = new Graphics();
    const hpFill = new Graphics();
    const facing = withFacing ? new Graphics() : undefined;
    const label = new Text({
      text: "",
      style: {
        fill: 0xffffff,
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: withFacing ? 0.18 : 0.16,
        fontWeight: "800",
        stroke: { color: 0x102b3a, width: withFacing ? 0.035 : 0.045 },
        dropShadow: { color: 0x102b3a, blur: 1, distance: 0.025, alpha: 0.9 }
      }
    });
    const reviveRing = withFacing ? new Graphics() : undefined;
    const bleedRing = withFacing ? new Graphics() : undefined;

    container.addChild(ground, body, flash);
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
    node = {
      container,
      ground,
      body,
      facing,
      hpBack,
      hpFill,
      label,
      reviveRing,
      bleedRing,
      flash,
      flashMs: 0,
      reactionMs: 0,
      reactionDx: 0,
      reactionDy: 0,
      baseScale: 1
    };
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

function drawEnemyLabel(node: EntityNode, enemy: EnemyView): void {
  if (node.label === undefined) {
    return;
  }

  const def = ENEMIES[enemy.kind as keyof typeof ENEMIES];
  node.label.text = def?.name ?? enemy.kind;
  node.label.position.set(0, -Math.max(0.82, enemy.radius + 0.44));
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

function drawHpBar(node: EntityNode, ratio: number, y = -0.68, width = 0.84): void {
  const clamped = clamp01(ratio);
  const color = hpColor(clamped);
  node.hpBack?.clear().roundRect(-width / 2, y, width, 0.11, 0.03).fill(0x2b1d1d);
  node.hpFill
    ?.clear()
    .roundRect(-width / 2 + 0.02, y + 0.02, Math.max(0, width - 0.04) * clamped, 0.07, 0.025)
    .fill(color);
}

function drawEntityFlash(node: EntityNode, color: number, radius: number): void {
  node.flash?.clear();
  if (node.flash === undefined || node.flashMs <= 0) {
    return;
  }

  const alpha = clamp01(node.flashMs / Math.max(HIT_FLASH_MS, PLAYER_HURT_FLASH_MS)) * 0.58;
  node.flash.circle(0, 0, radius).fill({ color, alpha });
}

function drawParticle(
  graphic: Graphics,
  particle: ParticleSpec,
  x: number,
  y: number,
  alpha: number
): void {
  graphic.position.set(x, y);
  graphic.clear();

  if (particle.shape === "bone") {
    graphic
      .roundRect(-particle.radius * 1.8, -particle.radius * 0.45, particle.radius * 3.6, particle.radius * 0.9, particle.radius * 0.45)
      .fill({ color: particle.color, alpha })
      .circle(-particle.radius * 1.7, 0, particle.radius * 0.72)
      .circle(particle.radius * 1.7, 0, particle.radius * 0.72)
      .fill({ color: particle.color, alpha });
    return;
  }

  if (particle.shape === "spark") {
    graphic
      .moveTo(-particle.radius * 1.8, 0)
      .lineTo(particle.radius * 1.8, 0)
      .moveTo(0, -particle.radius * 1.8)
      .lineTo(0, particle.radius * 1.8)
      .stroke({ color: particle.color, width: particle.radius * 0.7, alpha, cap: "round" });
    return;
  }

  graphic
    .circle(0, 0, particle.radius * (particle.shape === "coin" ? 1.25 : 1))
    .fill({ color: particle.color, alpha: particle.shape === "bubble" ? alpha * 0.2 : alpha })
    .stroke({
      color: particle.shape === "bubble" ? particle.color : 0x8f6400,
      width: particle.radius * 0.45,
      alpha
    });
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

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
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

  const bossHud = root.querySelector<HTMLElement>("[data-boss-hud]");
  const bossFill = root.querySelector<HTMLElement>("[data-boss-fill]");
  bossHud?.toggleAttribute("hidden", state.boss === null);
  if (state.boss !== null) {
    root.querySelector<HTMLElement>("[data-boss-name]")?.replaceChildren(state.boss.name);
    root.querySelector<HTMLElement>("[data-boss-phase]")?.replaceChildren(state.boss.phaseText);
    if (bossFill !== null) {
      bossFill.style.width = `${Math.round(state.boss.hpRatio * 100)}%`;
    }
  }
}

export function bossPhaseText(phase: NonNullable<InterpolatedState["boss"]>["phase"]): string {
  if (phase === "tentacles") {
    return "The Kraken's tentacles rise!";
  }

  if (phase === "head") {
    return "The head surfaces - strike now!";
  }

  return "The sea stills... brace!";
}

function phaseText(phase: InterpolatedState["wave"]["phase"], timeLeft: number): string {
  if (phase === "combat") {
    return timeLeft > 0
      ? `FIGHT - survive the wave! ${Math.ceil(timeLeft)}s`
      : "FIGHT - survive the wave!";
  }

  if (phase === "build") {
    return timeLeft > 0
      ? `BUILD - shop is open, Ready Up when done ${Math.ceil(timeLeft)}s`
      : "BUILD - shop is open, Ready Up when done";
  }

  return phase === "victory" ? "Victory" : "Defeat";
}
