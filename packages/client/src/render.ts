import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TilingSprite } from "pixi.js";
import { CHARACTERS, ENEMIES, WEAPONS } from "@patchwork/content";
import type {
  EnemyView,
  HazardView,
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
import { settingsForTier } from "./quality";
import type { QualitySettings } from "./quality";
import { expansionSites as computeExpansionSites, nearestExpansionSite as computeNearestExpansionSite } from "./shopLogic";
import type { TileCoord, ViewportTransform } from "./shopLogic";
import { loadSpriteAtlas, setSpriteAnimationFrame, setSpriteFrame } from "./sprites";
import type { SpriteAtlas } from "./sprites";

export const TILE_PX = 60;

const RAFT_SIZE_TILES = 5;
const VIEW_MARGIN_TILES = 3;
const PLAYER_RADIUS = 0.38;
const SLASH_DURATION_MS = 180;
const CUTLASS_SWING_DURATION_MS = 220;
const HIT_DURATION_MS = 140;
const KILL_DURATION_MS = 260;
const EXPLOSION_DURATION_MS = 360;
const PING_LIFE_MS = 3_000;
const HIT_FLASH_MS = 130;
const HIT_REACTION_MS = 150;
const PLAYER_HURT_FLASH_MS = 180;
const PLAYER_ATTACK_READ_MS = 260;
const PLAYER_ATTACK_PULSE_STRENGTH = 0.08;
const ENEMY_ATTACK_READ_MS = 220;
const ENEMY_ATTACK_PULSE_STRENGTH = 0.22;
const ENEMY_WINDUP_SCALE = 1.06;
const ENEMY_WINDUP_ROTATION = 0.06;
const PICKUP_FLY_MS = 320;
const REPAIR_SUPPLY_FLY_MS = 320;
const REPAIR_TILE_HP = 10;
// Mirrors packages/sim/src/constants.ts; client cannot import sim.
const DAMAGED_TILE_HP_PER_SUPPLY = 4;
// Mirrors packages/sim/src/constants.ts; client cannot import sim.
const BROKEN_TILE_HP_PER_SUPPLY = 2.5;
const DEFEAT_TILE_STAGGER_MS = 110;
const DEFEAT_TILE_SINK_MS = 650;
const DEFEAT_UI_DELAY_MS = 220;
const PROJECTILE_TRAIL_INTERVAL_MS = 55;
const LEAPER_SPRAY_INTERVAL_MS = 70;
const LEAPER_FAST_DELTA_TILES = 0.12;
const OCEAN_BASE_PATH = "/assets/water/ocean-base.png";
const OCEAN_SHIMMER_PATH = "/assets/water/ocean-shimmer.png";
const OCEAN_TILE_SCALE = 0.5;
const OCEAN_PARALLAX = 0.2;
const OCEAN_SWAY_PX = 6;

interface OceanLayers {
  base: TilingSprite;
  shimmer: TilingSprite;
  baseScrollX: number;
  baseScrollY: number;
  shimmerScrollX: number;
  shimmerScrollY: number;
}

interface ProjectileMotionConfig {
  faceHeading?: boolean;
  rotationOffset?: number;
  wobble?: boolean;
  spinMs?: number;
  arcBob?: boolean;
  noTrail?: boolean;
  skipHeading?: boolean;
  trailTint: number;
}

const PROJECTILE_MOTION: Record<string, ProjectileMotionConfig> = {
  harpoon_gun: { faceHeading: true, rotationOffset: 0, trailTint: 0xbfe9ff },
  harpoon_projectile: { faceHeading: true, rotationOffset: 0, trailTint: 0xbfe9ff },
  seagull_bell: { faceHeading: true, rotationOffset: -Math.PI / 2, wobble: true, trailTint: 0xffffff },
  coconut_launcher: { spinMs: 0.012, arcBob: true, trailTint: 0xd8f2a4 },
  coconut_projectile: { spinMs: 0.012, arcBob: true, trailTint: 0xd8f2a4 },
  cannon: { spinMs: 0.006, trailTint: 0x9aa7b0 },
  cannon_projectile: { spinMs: 0.006, trailTint: 0x9aa7b0 },
  anchor_flail: { spinMs: 0.0014, noTrail: true, skipHeading: true, trailTint: 0xffffff }
} satisfies Record<string, ProjectileMotionConfig>;
const DEFAULT_PROJECTILE_MOTION: ProjectileMotionConfig = {
  faceHeading: true,
  rotationOffset: 0,
  trailTint: 0xfff2a0
};
const ENEMY_PROJECTILE_MOTION: ProjectileMotionConfig = {
  faceHeading: true,
  rotationOffset: 0,
  trailTint: 0x9fe37d
};

interface EntityNode {
  container: Container;
  ground: Graphics;
  body: Graphics;
  sprite?: Sprite;
  spriteKey?: string;
  weaponVisual?: Graphics;
  weaponTrail?: Graphics;
  weaponVisualDrawn: boolean;
  facing?: Graphics;
  hpBack?: Graphics;
  hpBackKey?: string;
  hpFill?: Graphics;
  hpFillKey?: string;
  label?: Text;
  labelY?: number;
  reviveRing?: Graphics;
  reviveRingKey?: number;
  bleedRing?: Graphics;
  bleedRingKey?: number;
  downedRingsVisible: boolean;
  flash?: Graphics;
  flashRadius?: number;
  flashColor?: number;
  flashVisible: boolean;
  enemyBodyKey?: string;
  enemyGroundKey?: string;
  flashMs: number;
  reactionMs: number;
  reactionDx: number;
  reactionDy: number;
  baseScale: number;
  animStartMs: number;
  lastAnimState?: string;
  animStateStartedAtMs: number;
}

interface SlashVfx {
  ageMs: number;
  graphic: Graphics;
  weaponId: string;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  arcDegrees: number;
  range: number;
}

interface WeaponSwing {
  startedAtMs: number;
  lastAttackMs: number;
  dx: number;
  dy: number;
}

interface PopVfx {
  ageMs: number;
  durationMs: number;
  sprite: Sprite;
  x: number;
  y: number;
  color: number;
  kind: "hit" | "kill" | "explosion" | "splash" | "repair" | "scream";
}

interface PingNode {
  graphic: Graphics;
  ageMs: number;
}

interface ParticleVfx extends Omit<ParticleSpec, "shape"> {
  shape: ParticleSpec["shape"] | "trailPuff";
  ageMs: number;
  sprite: Sprite;
}

interface ProjectileMotionState {
  lastX: number;
  lastY: number;
  headingRad: number;
  ageMs: number;
  trailAccumMs: number;
}

interface PickupFlyVfx {
  ageMs: number;
  sprite: Sprite;
  kind: string;
  x: number;
  y: number;
  ownerX: number;
  ownerY: number;
}

interface PendingRepairPresentation {
  hpDelta: number;
  applyAtMs: number;
  x: number;
  y: number;
  broken: boolean;
}

interface RepairSupplyFlyVfx {
  ageMs: number;
  sprite: Sprite;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  wobble: number;
}

interface PickupRecord {
  id: string;
  kind: string;
  x: number;
  y: number;
}

type VfxTextureKey =
  | "popRing"
  | "splashRing"
  | "repairRing"
  | "trailPuff"
  | "particleBubble"
  | "particleCoin"
  | "particleBone"
  | "particleSpark"
  | "pickupFlyOrb"
  | "supplyCrate";

interface TelegraphNode {
  graphic: Graphics;
  key: number;
}

interface DefeatSink {
  startedAtMs: number;
  tiles: RaftView["tiles"];
  order: Map<string, number>;
}

interface RaftTileNode {
  root: Container;
  base: Graphics;
  overlay: Graphics;
  baseKey: string;
  overlayKey: string;
}

interface RaftBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface HudState {
  status: ConnectionStatus;
  waveText: string;
  phaseText: string;
  coinsText: string;
  salvageText: string;
  hpText: string;
  hpRatio: number;
  weaponSlots: string[];
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
  private readonly raftTiles = new Map<string, RaftTileNode>();
  private readonly expansionMarkers = new Map<string, Graphics>();
  private readonly hazardNodes = new Map<string, Graphics>();
  private readonly hazardSprites = new Map<string, Sprite>();
  private readonly nearestExpansionMarker = new Graphics();
  private readonly modules = new Map<string, Graphics>();
  private readonly moduleSprites = new Map<string, Sprite>();
  private readonly projectiles = new Map<string, Graphics>();
  private readonly projectileFallbackKeys = new Map<string, string>();
  private readonly projectileSprites = new Map<string, Sprite>();
  private readonly projectileMotion = new Map<string, ProjectileMotionState>();
  private readonly players = new Map<string, EntityNode>();
  private readonly enemies = new Map<string, EntityNode>();
  private readonly pickups = new Map<string, Graphics>();
  private readonly pickupSprites = new Map<string, Sprite>();
  private readonly telegraphs = new Map<string, TelegraphNode>();
  private readonly pings = new Map<string, PingNode>();
  private readonly slashes: SlashVfx[] = [];
  private readonly weaponSwings = new Map<string, WeaponSwing>();
  private readonly pops: PopVfx[] = [];
  private readonly particles: ParticleVfx[] = [];
  private readonly pickupFlies: PickupFlyVfx[] = [];
  private readonly repairSupplyFlies: RepairSupplyFlyVfx[] = [];
  private readonly vfxTextures = new Map<VfxTextureKey, Texture>();
  private readonly vfxSpritePools = new Map<VfxTextureKey, Sprite[]>();
  private readonly enemyKinds = new Map<string, string>();
  private readonly previousEnemyPositions = new Map<string, { x: number; y: number }>();
  private readonly enemySprayMs = new Map<string, number>();
  private readonly previousEnemyDeckState = new Map<string, boolean>();
  private readonly previousPlayerHp = new Map<string, number>();
  private readonly previousPlayerPositions = new Map<string, { x: number; y: number }>();
  private readonly repairTargetKeys = new Set<string>();
  private readonly repairSources = new Map<string, { x: number; y: number }>();
  private readonly needSupplyTargetKeys = new Set<string>();
  private readonly previousTileState = new Map<string, { hpRatio: number; broken: boolean }>();
  private readonly repairSupplyRemainders = new Map<string, number>();
  private readonly pendingRepairPresentation = new Map<string, PendingRepairPresentation[]>();
  private buildTarget: TileCoord | undefined;
  private readonly expansionSites: TileCoord[] = [];
  private nearestExpansionSite: TileCoord | undefined;
  private expansionSitesRaft: RaftView | undefined;
  private cachedExpansionSites: TileCoord[] = [];
  private defeatSink: DefeatSink | undefined;
  private raftBounds: RaftBounds = { minCol: 0, maxCol: 4, minRow: 0, maxRow: 4 };
  private readonly previousPickups: PickupRecord[] = [];
  private readonly previousPickupRecords = new Map<string, PickupRecord>();
  private shakeAgeMs = Number.POSITIVE_INFINITY;
  private shakeAmplitude = 0;
  private baseWorldX = 0;
  private baseWorldY = 0;
  private renderClockMs = 0;
  private readonly baseResolution: number;
  private qualitySettings: QualitySettings = settingsForTier("high");
  private oceanLayers: OceanLayers | undefined;

  private constructor(
    readonly app: Application,
    private readonly spriteAtlas: SpriteAtlas | null,
    baseResolution: number
  ) {
    this.baseResolution = baseResolution;
    app.stage.addChild(this.world);
    this.world.addChild(this.raft);
    drawExpansionMarker(this.nearestExpansionMarker, 0xf2c14e, 0.05, 1);
    this.nearestExpansionMarker.visible = false;
    this.raft.addChild(this.nearestExpansionMarker);
    this.drawRaft();
    this.resize();
    window.addEventListener("resize", this.resize);
    this.initOceanLayers();
  }

  static async create(parent: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    const baseResolution = Math.min(window.devicePixelRatio || 1, 2);
    await app.init({
      background: "#5ca9c9",
      antialias: false,
      powerPreference: "high-performance",
      resolution: baseResolution,
      autoDensity: true,
      resizeTo: window
    });
    app.canvas.className = "game-canvas";
    parent.appendChild(app.canvas);

    const spriteAtlas = await loadSpriteAtlas();
    return new GameRenderer(app, spriteAtlas, baseResolution);
  }

  destroy(): void {
    window.removeEventListener("resize", this.resize);
    this.app.destroy(true);
  }

  setBuildTarget(target: TileCoord | undefined): void {
    this.buildTarget = target;
  }

  setExpansionSites(sites: readonly TileCoord[], nearest: TileCoord | undefined): void {
    this.expansionSites.length = 0;
    this.expansionSites.push(...sites);
    this.nearestExpansionSite = nearest;
  }

  applyQuality(settings: QualitySettings): void {
    if (
      this.qualitySettings.resolutionScale === settings.resolutionScale &&
      this.qualitySettings.particleMultiplier === settings.particleMultiplier &&
      this.qualitySettings.enemyWakes === settings.enemyWakes &&
      this.qualitySettings.screenShake === settings.screenShake &&
      this.qualitySettings.enemyDeckBob === settings.enemyDeckBob &&
      this.qualitySettings.oceanAnimation === settings.oceanAnimation
    ) {
      return;
    }

    this.qualitySettings = settings;
    this.applyOceanQuality();
    this.app.renderer.resolution = this.baseResolution * settings.resolutionScale;
    this.app.resize();
  }

  perfStats(): { graphicsAlive: number } {
    let graphicsAlive =
      this.raftTiles.size * 3 +
      this.expansionMarkers.size +
      this.hazardNodes.size +
      this.hazardSprites.size +
      1 +
      this.modules.size +
      this.moduleSprites.size +
      this.projectiles.size +
      this.projectileSprites.size +
      this.pickups.size +
      this.pickupSprites.size +
      this.telegraphs.size +
      this.pings.size +
      this.slashes.length +
      this.pops.length +
      this.particles.length +
      this.pickupFlies.length +
      this.repairSupplyFlies.length +
      (this.oceanLayers === undefined ? 0 : 2);

    for (const node of this.players.values()) {
      graphicsAlive += countEntityGraphics(node);
    }
    for (const node of this.enemies.values()) {
      graphicsAlive += countEntityGraphics(node);
    }

    return { graphicsAlive };
  }

  startDefeatSink(raft: RaftView | undefined): void {
    if (this.defeatSink !== undefined) {
      return;
    }

    this.pendingRepairPresentation.clear();
    const tiles = (raft?.tiles ?? fallbackRaft().tiles).map((tile) => ({ ...tile }));
    this.defeatSink = {
      startedAtMs: this.renderClockMs,
      tiles,
      order: defeatTileOrder(tiles)
    };
    this.addShake(0.12);
  }

  resetDefeatSink(): void {
    this.defeatSink = undefined;
    for (const node of this.raftTiles.values()) {
      node.baseKey = "";
      node.overlayKey = "";
    }
  }

  defeatSinkComplete(): boolean {
    if (this.defeatSink === undefined) {
      return true;
    }

    const totalMs =
      Math.max(0, this.defeatSink.tiles.length - 1) * DEFEAT_TILE_STAGGER_MS +
      DEFEAT_TILE_SINK_MS +
      DEFEAT_UI_DELAY_MS;
    return this.renderClockMs - this.defeatSink.startedAtMs >= totalMs;
  }

  pushEvents(events: readonly WireEvent[]): void {
    for (const event of events) {
      if (event.type === "weapon_fired") {
        const existingSwing = this.weaponSwings.get(event.wielderId);
        if (event.weaponId === "cutlass") {
          this.weaponSwings.set(event.wielderId, {
            startedAtMs: this.renderClockMs,
            lastAttackMs: this.renderClockMs,
            dx: event.dx,
            dy: event.dy
          });
          continue;
        }

        this.weaponSwings.set(event.wielderId, {
          startedAtMs: existingSwing?.startedAtMs ?? Number.NEGATIVE_INFINITY,
          lastAttackMs: this.renderClockMs,
          dx: existingSwing?.dx ?? event.dx,
          dy: existingSwing?.dy ?? event.dy
        });

        this.addPop(event.ox + event.dx * 0.45, event.oy + event.dy * 0.45, 0xfff2c9, 120, "hit");
        const graphic = new Graphics();
        this.world.addChild(graphic);
        this.slashes.push({
          ageMs: 0,
          graphic,
          weaponId: event.weaponId,
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
      } else if (event.type === "enemy_screamed") {
        this.addPop(event.x, event.y, 0xffb3ec, 320, "scream");
        this.addShake(0.02);
      } else if (event.type === "trap_triggered") {
        this.addPop(event.x, event.y, 0xd9e5ec, 180, "hit");
        this.addShake(0.035);
      } else if (event.type === "tile_built") {
        this.addPop(event.col + 0.5, event.row + 0.5, 0x9dd7e8, 200, "repair");
        this.addShake(0.03);
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
    this.updateExpansionSites(state, myPlayerId);
    this.updateRepairTargets(state.players, state.raft, state.salvage ?? 0);
    this.updateRepairFeedback(state.raft);
    this.updatePendingRepairPresentation(state.raft);
    this.drawRaft(state.raft);
    this.updateExpansionMarkers(state.wave.phase);
    this.updateTelegraphs(state.enemies);
    this.updateHazards(state.hazards);
    this.updateModules(state.modules);
    this.updateProjectiles(state.projectiles, deltaMs);
    this.updatePlayers(state.players, myPlayerId, deltaMs);
    this.updateEnemies(state.enemies, state.raft, deltaMs);
    this.updatePickups(state.pickups);
    const collectedPickups = this.updatePickupCollection(state.pickups, state.players);
    this.updatePings(state.pings, deltaMs);
    this.updateSlashes(deltaMs);
    this.updatePops(deltaMs);
    this.updateParticles(deltaMs);
    this.updatePickupFlies(deltaMs);
    this.updateRepairSupplyFlies(deltaMs);
    this.updateShake(deltaMs);
    this.updateOceanLayers(deltaMs);
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
    const weaponIds = ownPlayer?.weaponIds ?? [];
    const weaponSlots = [
      weaponDisplayName(weaponIds[0]),
      weaponDisplayName(weaponIds[1]),
      weaponDisplayName(weaponIds[2]),
      weaponDisplayName(weaponIds[3])
    ];

    return {
      status,
      waveText:
        state.boss === null || state.boss === undefined
          ? `Wave ${state.wave.number}`
          : `Wave ${state.wave.number} - Boss`,
      phaseText: phaseText(state.wave.phase, state.wave.timeLeft),
      coinsText: `Coins ${ownPlayer?.coins ?? 0}`,
      salvageText: `Supplies ${Math.floor(state.salvage ?? 0)}/${state.supplyCap ?? 20}`,
      hpText,
      hpRatio: clamp01(hpRatio),
      weaponSlots,
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
    this.fitViewportToRaftBounds();
    this.resizeOceanLayers();
  };

  private initOceanLayers(): void {
    void this.loadOceanLayers();
  }

  private async loadOceanLayers(): Promise<void> {
    try {
      const [baseTexture, shimmerTexture] = await Promise.all([
        Assets.load<Texture>(OCEAN_BASE_PATH),
        Assets.load<Texture>(OCEAN_SHIMMER_PATH)
      ]);

      if (this.oceanLayers !== undefined) {
        return;
      }

      const base = new TilingSprite({
        texture: baseTexture,
        width: window.innerWidth,
        height: window.innerHeight
      });
      const shimmer = new TilingSprite({
        texture: shimmerTexture,
        width: window.innerWidth,
        height: window.innerHeight
      });
      base.tileScale.set(OCEAN_TILE_SCALE);
      shimmer.tileScale.set(OCEAN_TILE_SCALE);
      shimmer.alpha = 0.28;
      this.oceanLayers = {
        base,
        shimmer,
        baseScrollX: 0,
        baseScrollY: 0,
        shimmerScrollX: 0,
        shimmerScrollY: 0
      };
      this.app.stage.addChildAt(base, 0);
      this.app.stage.addChildAt(shimmer, 1);
      this.applyOceanQuality();
      this.resizeOceanLayers();
      this.updateOceanLayers(0);
    } catch {
      console.info("Ocean texture assets unavailable; using flat water background.");
    }
  }

  private applyOceanQuality(): void {
    if (this.oceanLayers === undefined) {
      return;
    }

    this.oceanLayers.shimmer.visible = this.qualitySettings.oceanAnimation;
  }

  private resizeOceanLayers(): void {
    if (this.oceanLayers === undefined) {
      return;
    }

    this.oceanLayers.base.width = window.innerWidth;
    this.oceanLayers.base.height = window.innerHeight;
    this.oceanLayers.shimmer.width = window.innerWidth;
    this.oceanLayers.shimmer.height = window.innerHeight;
  }

  private updateOceanLayers(deltaMs: number): void {
    if (this.oceanLayers === undefined || !this.qualitySettings.oceanAnimation) {
      return;
    }

    const layers = this.oceanLayers;
    const sway = Math.sin(this.renderClockMs * 0.0003) * OCEAN_SWAY_PX;
    const parallaxX = (this.baseWorldX + (this.world.position.x - this.baseWorldX)) * OCEAN_PARALLAX;
    const parallaxY = (this.baseWorldY + (this.world.position.y - this.baseWorldY)) * OCEAN_PARALLAX;
    layers.baseScrollX += deltaMs * 0.008;
    layers.baseScrollY += deltaMs * 0.005;
    layers.shimmerScrollX -= deltaMs * 0.0128;
    layers.shimmerScrollY -= deltaMs * 0.008;
    layers.base.tilePosition.set(
      layers.baseScrollX + sway + parallaxX,
      layers.baseScrollY + parallaxY
    );
    layers.shimmer.tilePosition.set(
      layers.shimmerScrollX - sway * 0.6 + parallaxX * 0.65,
      layers.shimmerScrollY + parallaxY * 0.65
    );
  }

  private fitViewportToRaftBounds(): void {
    const widthTiles = this.raftBounds.maxCol - this.raftBounds.minCol + 1;
    const heightTiles = this.raftBounds.maxRow - this.raftBounds.minRow + 1;
    const viewWidthTiles = widthTiles + VIEW_MARGIN_TILES * 2;
    const viewHeightTiles = heightTiles + VIEW_MARGIN_TILES * 2;
    const fitTilePx = Math.max(
      36,
      Math.min(TILE_PX, window.innerWidth / viewWidthTiles, window.innerHeight / viewHeightTiles)
    );
    const centerX = (this.raftBounds.minCol + this.raftBounds.maxCol + 1) / 2;
    const centerY = (this.raftBounds.minRow + this.raftBounds.maxRow + 1) / 2;
    this.world.scale.set(fitTilePx);
    this.baseWorldX = window.innerWidth / 2 - centerX * fitTilePx;
    this.baseWorldY = window.innerHeight / 2 - centerY * fitTilePx;
    this.world.position.set(this.baseWorldX, this.baseWorldY);
  }

  private drawRaft(raft?: RaftView): void {
    const tiles = this.defeatSink?.tiles ?? raft?.tiles ?? fallbackRaft().tiles;
    const seen = new Set<string>();
    const sinking = this.defeatSink !== undefined;
    this.updateRaftBounds(tiles);

    for (const tileView of tiles) {
      const key = tileKey(tileView.col, tileView.row);
      seen.add(key);
      let node = this.raftTiles.get(key);

      if (node === undefined) {
        const root = new Container();
        const base = new Graphics();
        const overlay = new Graphics();
        root.position.set(tileView.col, tileView.row);
        root.addChild(base, overlay);
        this.raft.addChild(root);
        node = { root, base, overlay, baseKey: "", overlayKey: "" };
        this.raftTiles.set(key, node);
      }

      const hpRatio = clamp01(tileView.hpRatio);
      const displayedHpRatio = this.displayedTileHpRatio(key, hpRatio);
      const displayTileView =
        displayedHpRatio === hpRatio ? tileView : { ...tileView, hpRatio: displayedHpRatio };
      const baseKey = `${tileView.kind}|${tileView.broken}|${Math.round(displayedHpRatio * 50)}|${sinking ? 1 : 0}`;
      if (node.baseKey !== baseKey) {
        node.baseKey = baseKey;
        drawRaftTileBase(node.base.clear(), tileView, displayedHpRatio, sinking);
      }

      const repairing = this.repairTargetKeys.has(key);
      const needsSupply = this.needSupplyTargetKeys.has(key);
      const buildTarget = isSameTile(this.buildTarget, tileView);
      const damaged = tileView.broken || displayedHpRatio < 1;
      const overlayKey = `${damaged ? Math.round(displayedHpRatio * 50) : -1}|${repairing}|${needsSupply}|${buildTarget}`;
      if (node.overlayKey !== overlayKey) {
        node.overlayKey = overlayKey;
        drawTileAffordances(node.overlay.clear(), displayTileView, {
          repairing,
          needsSupply,
          buildTarget
        });
      }

      const pulse = (Math.sin(this.renderClockMs * 0.006) + 1) / 2;
      node.overlay.alpha = repairing || buildTarget ? 0.75 + pulse * 0.25 : 1;
      const sink =
        this.defeatSink === undefined
          ? undefined
          : sinkStateForTile(this.defeatSink, tileView, this.renderClockMs);
      node.root.position.set(tileView.col, tileView.row + (sink?.offsetY ?? 0));
      node.root.alpha = sink?.alpha ?? 1;
    }

    for (const [key, node] of this.raftTiles) {
      if (!seen.has(key)) {
        node.root.destroy({ children: true });
        this.raftTiles.delete(key);
      }
    }
  }

  private updateRaftBounds(tiles: readonly RaftView["tiles"][number][]): void {
    let minCol = 0;
    let maxCol = 4;
    let minRow = 0;
    let maxRow = 4;

    if (tiles.length > 0) {
      minCol = Number.POSITIVE_INFINITY;
      maxCol = Number.NEGATIVE_INFINITY;
      minRow = Number.POSITIVE_INFINITY;
      maxRow = Number.NEGATIVE_INFINITY;

      for (const tile of tiles) {
        minCol = Math.min(minCol, tile.col);
        maxCol = Math.max(maxCol, tile.col);
        minRow = Math.min(minRow, tile.row);
        maxRow = Math.max(maxRow, tile.row);
      }
    }

    if (
      this.raftBounds.minCol === minCol &&
      this.raftBounds.maxCol === maxCol &&
      this.raftBounds.minRow === minRow &&
      this.raftBounds.maxRow === maxRow
    ) {
      return;
    }

    this.raftBounds = { minCol, maxCol, minRow, maxRow };
    this.fitViewportToRaftBounds();
  }

  private updateExpansionMarkers(phase: InterpolatedState["wave"]["phase"]): void {
    const visible = phase === "build" && this.defeatSink === undefined;
    const seen = new Set<string>();

    for (const site of this.expansionSites) {
      const key = tileKey(site.col, site.row);
      seen.add(key);
      let marker = this.expansionMarkers.get(key);

      if (marker === undefined) {
        marker = new Graphics();
        drawExpansionMarker(marker, 0x9dd7e8, 0.03, 0.35);
        marker.position.set(site.col, site.row);
        this.expansionMarkers.set(key, marker);
        this.raft.addChildAt(marker, 0);
      }

      marker.visible = visible;
    }

    for (const [key, marker] of this.expansionMarkers) {
      if (!seen.has(key)) {
        marker.destroy();
        this.expansionMarkers.delete(key);
      }
    }

    this.nearestExpansionMarker.visible = visible && this.nearestExpansionSite !== undefined;

    if (!visible) {
      return;
    }

    if (this.nearestExpansionSite !== undefined) {
      const pulse = (Math.sin(this.renderClockMs * 0.006) + 1) / 2;
      this.nearestExpansionMarker.position.set(
        this.nearestExpansionSite.col,
        this.nearestExpansionSite.row
      );
      this.nearestExpansionMarker.alpha = 0.55 + pulse * 0.35;
    }
  }

  private updateExpansionSites(state: InterpolatedState, myPlayerId: string | undefined): void {
    if (state.wave.phase !== "build") {
      if (this.expansionSites.length > 0 || this.nearestExpansionSite !== undefined) {
        this.setExpansionSites([], undefined);
      }
      this.expansionSitesRaft = undefined;
      return;
    }

    // interp passes snapshot references through, so the raft object only
    // changes identity when a new snapshot arrives — recompute the (allocating)
    // site scan on that identity change, not every frame.
    const player = state.players.find((candidate) => candidate.id === myPlayerId);
    if (state.raft !== this.expansionSitesRaft) {
      this.expansionSitesRaft = state.raft;
      this.cachedExpansionSites = computeExpansionSites(state.raft);
    }
    this.setExpansionSites(
      this.cachedExpansionSites,
      computeNearestExpansionSite(state.raft, player, undefined, this.cachedExpansionSites)
    );
  }

  private updateRepairTargets(
    players: readonly PlayerView[],
    raft: RaftView | undefined,
    supplies: number
  ): void {
    this.repairTargetKeys.clear();
    this.repairSources.clear();
    this.needSupplyTargetKeys.clear();
    if (raft === undefined) {
      return;
    }

    for (const player of players) {
      if (player.downed || (player.out ?? false)) {
        continue;
      }

      const target = nearestRepairTile(raft, player);
      if (target === undefined) {
        continue;
      }

      const key = tileKey(target.col, target.row);
      if (supplies > 0) {
        this.repairTargetKeys.add(key);
        this.repairSources.set(key, { x: player.x, y: player.y });
      } else {
        this.needSupplyTargetKeys.add(key);
      }
    }
  }

  private updateRepairFeedback(raft: RaftView | undefined): void {
    if (raft === undefined || this.defeatSink !== undefined) {
      if (this.defeatSink !== undefined) {
        this.pendingRepairPresentation.clear();
      }
      return;
    }

    const seen = new Set<string>();
    for (const tile of raft.tiles) {
      const key = tileKey(tile.col, tile.row);
      seen.add(key);
      const previous = this.previousTileState.get(key);
      const brokenStateChanged = previous !== undefined && previous.broken !== tile.broken;
      if (brokenStateChanged) {
        this.pendingRepairPresentation.delete(key);
      }
      if (
        previous !== undefined &&
        (tile.hpRatio > previous.hpRatio + 0.003 || (previous.broken && !tile.broken))
      ) {
        const hpDelta = Math.max(0, tile.hpRatio - previous.hpRatio) * REPAIR_TILE_HP;
        const supplyPackets = this.addRepairSupplyFliesForHpGain(
          key,
          hpDelta,
          previous.broken,
          tile.col + 0.5,
          tile.row + 0.5
        );
        if (supplyPackets > 0 && !brokenStateChanged) {
          this.addPendingRepairPresentation(key, hpDelta, tile.col + 0.5, tile.row + 0.5, tile.broken);
        }
      }

      this.previousTileState.set(key, { hpRatio: tile.hpRatio, broken: tile.broken });
    }

    for (const key of this.previousTileState.keys()) {
      if (!seen.has(key)) {
        this.previousTileState.delete(key);
        this.repairSupplyRemainders.delete(key);
        this.pendingRepairPresentation.delete(key);
      }
    }
  }

  private addPendingRepairPresentation(
    key: string,
    hpDelta: number,
    x: number,
    y: number,
    broken: boolean
  ): void {
    if (hpDelta <= 0) {
      return;
    }

    const pending = this.pendingRepairPresentation.get(key) ?? [];
    pending.push({
      hpDelta,
      applyAtMs: this.renderClockMs + REPAIR_SUPPLY_FLY_MS,
      x,
      y,
      broken
    });
    this.pendingRepairPresentation.set(key, pending);
  }

  private updatePendingRepairPresentation(raft: RaftView | undefined): void {
    if (raft === undefined || this.defeatSink !== undefined) {
      this.pendingRepairPresentation.clear();
      return;
    }

    const tiles = new Map(raft.tiles.map((tile) => [tileKey(tile.col, tile.row), tile]));
    for (const [key, pending] of this.pendingRepairPresentation) {
      const tile = tiles.get(key);
      if (tile === undefined || pending.some((entry) => entry.broken !== tile.broken)) {
        this.pendingRepairPresentation.delete(key);
        continue;
      }

      const remaining: PendingRepairPresentation[] = [];
      for (const entry of pending) {
        if (this.renderClockMs >= entry.applyAtMs) {
          this.addPop(entry.x, entry.y, 0x9dffd7, 200, "repair");
          this.addShake(0.015);
        } else {
          remaining.push(entry);
        }
      }

      if (remaining.length > 0) {
        this.pendingRepairPresentation.set(key, remaining);
      } else {
        this.pendingRepairPresentation.delete(key);
      }
    }
  }

  private displayedTileHpRatio(key: string, hpRatio: number): number {
    const pending = this.pendingRepairPresentation.get(key);
    if (pending === undefined) {
      return hpRatio;
    }

    const pendingDelta = pending.reduce((sum, entry) => sum + entry.hpDelta, 0);
    return clamp01(hpRatio - pendingDelta / REPAIR_TILE_HP);
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
      const previousPosition = this.previousPlayerPositions.get(player.id);
      const moving =
        previousPosition !== undefined &&
        Math.hypot(player.x - previousPosition.x, player.y - previousPosition.y) > 0.003;
      this.previousPlayerPositions.set(player.id, { x: player.x, y: player.y });
      node.container.position.set(player.x, player.y);
      node.container.scale.set(popScale(node.flashMs, PLAYER_HURT_FLASH_MS, 0.1) * node.baseScale);
      node.container.rotation = 0;
      resetEntityVisualTransform(node);
      node.body.clear();

      if (player.downed) {
        hideEntitySprite(node);
        node.body
          .ellipse(0, 0.08, PLAYER_RADIUS * 1.2, PLAYER_RADIUS * 0.56)
          .fill(0x6d7480)
          .stroke({ color: 0xd8dde3, width: 0.045, alpha: 0.7 })
          .circle(-0.22, -0.02, 0.12)
          .fill(0x8a929c);
      } else {
        const assetId = player.characterId ?? "captain";
        const attackWindow = playerAttackWindow(this.weaponSwings.get(player.id), this.renderClockMs);
        const preferences = attackWindow.active ? ["attack", moving ? "walk" : "idle"] : [moving ? "walk" : "idle"];
        const spriteApplied = this.applyEntityVisual(node, assetId, preferences, PLAYER_RADIUS * 2.15);
        if (!spriteApplied) {
          node.body
            .circle(0, 0, PLAYER_RADIUS)
            .fill(isOwn ? 0x2f80ed : characterColor(player.characterId))
            .stroke({ color: isOwn ? 0xffffff : 0x12362c, width: isOwn ? 0.075 : 0.045 });
        }
        if (attackWindow.active && node.spriteKey !== `${assetId}/attack`) {
          applyEntityVisualPulse(node, attackWindow.ageMs, PLAYER_ATTACK_READ_MS, PLAYER_ATTACK_PULSE_STRENGTH);
        }
      }

      const facing = node.facing;
      if (facing !== undefined) {
        facing.clear();
      }
      const weaponSwing = this.weaponSwings.get(player.id);
      if (
        weaponSwing !== undefined &&
        this.renderClockMs - weaponSwing.startedAtMs >= CUTLASS_SWING_DURATION_MS &&
        this.renderClockMs - weaponSwing.lastAttackMs >= PLAYER_ATTACK_READ_MS
      ) {
        this.weaponSwings.delete(player.id);
      }
      drawPlayerWeaponVisual(node, player, this.renderClockMs, this.weaponSwings.get(player.id));

      drawHpBar(node, player.maxHp > 0 ? player.hp / player.maxHp : 0);
      drawPlayerLabel(node, `${isOwn ? "You" : characterName(player.characterId, CHARACTERS)}`);
      drawDownedRings(node, player);
      drawEntityFlash(node, player.downed ? 0xffb0b0 : 0xff5555, PLAYER_RADIUS * 1.05);
    }

    removeMissing(this.players, seen);
    for (const id of this.previousPlayerHp.keys()) {
      if (!seen.has(id)) {
        this.previousPlayerHp.delete(id);
        this.previousPlayerPositions.delete(id);
        this.weaponSwings.delete(id);
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
        node.graphic
          .circle(0, 0, 0.42)
          .stroke({ color: pingColor(ping.kind), width: 0.075 })
          .moveTo(-0.16, 0)
          .lineTo(0.16, 0)
          .moveTo(0, -0.16)
          .lineTo(0, 0.16)
          .stroke({ color: pingColor(ping.kind), width: 0.045 });
      } else {
        node.ageMs += deltaMs;
      }

      const t = clamp01(node.ageMs / PING_LIFE_MS);
      node.graphic.position.set(ping.x, ping.y);
      node.graphic.scale.set((0.28 + t * 0.28) / 0.42);
      node.graphic.alpha = 1 - t;
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
      this.updateLeaperSpray(enemy, deltaMs);
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
      node.container.rotation = 0;
      const bobY =
        onDeck && this.qualitySettings.enemyDeckBob
          ? enemyBobOffset(enemy.id, this.renderClockMs)
          : 0;
      node.body.position.set(0, bobY);
      node.flash?.position.set(0, bobY);
      resetEntityVisualTransform(node);
      updateEntityAnimState(node, enemy.anim, this.renderClockMs);
      drawEnemyGround(node, enemy, onDeck, this.renderClockMs, this.qualitySettings.enemyWakes);
      const preferences = enemyAnimationPreferences(enemy);
      if (!this.applyEntityVisual(node, enemy.kind, preferences, enemySpriteWorldSize(enemy))) {
        drawEnemy(node, enemy);
      }
      applyEnemyProceduralAttackRead(node, enemy, this.renderClockMs);
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
        this.previousEnemyPositions.delete(id);
        this.enemySprayMs.delete(id);
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
      let node = this.telegraphs.get(key);

      if (node === undefined) {
        node = { graphic: new Graphics(), key: -1 };
        this.telegraphs.set(key, node);
        this.world.addChild(node.graphic);
      }

      const drawKey = Math.round(telegraph.ratio * 50);
      if (drawKey !== node.key) {
        drawTelegraph(node.graphic, telegraph.col, telegraph.row, telegraph.ratio);
        node.key = drawKey;
      }
    }

    for (const [key, node] of this.telegraphs) {
      if (!byTile.has(key)) {
        node.graphic.destroy();
        this.telegraphs.delete(key);
      }
    }
  }

  private updateHazards(hazards: readonly HazardView[]): void {
    const seen = new Set<string>();

    for (const hazard of hazards) {
      seen.add(hazard.id);
      let graphic = this.hazardNodes.get(hazard.id);

      if (graphic === undefined) {
        graphic = new Graphics();
        drawHazard(graphic, hazard);
        graphic.position.set(hazard.x, hazard.y);
        this.hazardNodes.set(hazard.id, graphic);
        this.raft.addChildAt(graphic, 0);
      }

      const spriteApplied = this.applyWorldSprite(
        this.hazardSprites,
        hazard.id,
        frameKey(hazard.kind),
        hazard.x,
        hazard.y,
        hazard.radius * 2
      );
      const sprite = this.hazardSprites.get(hazard.id);
      graphic.visible = !spriteApplied;
      if (hazard.kind === "puddle") {
        const alpha = 0.85 + 0.15 * Math.sin(this.renderClockMs * 0.004 + idPhase(hazard.id));
        graphic.alpha = alpha;
        if (sprite !== undefined) {
          sprite.alpha = alpha;
        }
      } else {
        graphic.alpha = 1;
        if (sprite !== undefined) {
          sprite.alpha = 1;
        }
      }
      if (!spriteApplied) {
        graphic.position.set(hazard.x, hazard.y);
      }
    }

    for (const [id, graphic] of this.hazardNodes) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.hazardNodes.delete(id);
      }
    }
    removeMissingSprites(this.hazardSprites, seen);
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

      const sink =
        this.defeatSink === undefined
          ? undefined
          : sinkStateForTile(
              this.defeatSink,
              { col: module.col, row: module.row, kind: "deck", hpRatio: module.hpRatio, broken: false },
              this.renderClockMs
            );
      const spriteApplied = this.applyWorldSprite(
        this.moduleSprites,
        module.id,
        frameKey(module.defId),
        module.col + 0.5,
        module.row + 0.5 + (sink?.offsetY ?? 0),
        0.86
      );
      const moduleSprite = this.moduleSprites.get(module.id);
      if (moduleSprite !== undefined) {
        moduleSprite.alpha = sink?.alpha ?? 1;
      }
      graphic.visible = !spriteApplied;
      graphic.alpha = sink?.alpha ?? 1;
      graphic.position.set(0, sink?.offsetY ?? 0);
      if (!spriteApplied) {
        drawModule(graphic, module);
      }
    }

    for (const [id, graphic] of this.modules) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.modules.delete(id);
      }
    }
    removeMissingSprites(this.moduleSprites, seen);
  }

  private applyEntityVisual(
    node: EntityNode,
    assetId: string,
    preferences: readonly string[],
    visibleWorldSize: number
  ): boolean {
    const selectedAnimationName = preferences.find(
      (name) => this.spriteAtlas?.animation(assetId, name) !== undefined
    );
    const animation =
      selectedAnimationName === undefined
        ? undefined
        : this.spriteAtlas?.animation(assetId, selectedAnimationName);
    const frame = this.spriteAtlas?.frame(frameKey(assetId));
    if (animation === undefined && frame === undefined) {
      hideEntitySprite(node);
      return false;
    }

    if (node.sprite === undefined) {
      node.sprite = new Sprite(animation?.frames[0]?.texture ?? frame!.texture);
      node.container.addChildAt(node.sprite, 2);
    }

    const spriteKey = animation === undefined ? frameKey(assetId) : `${assetId}/${selectedAnimationName}`;
    if (node.spriteKey !== spriteKey) {
      node.spriteKey = spriteKey;
      node.animStartMs = this.renderClockMs;
    }
    node.sprite.position.set(node.body.position.x, node.body.position.y);
    if (animation !== undefined) {
      setSpriteAnimationFrame(
        node.sprite,
        animation,
        this.renderClockMs - node.animStartMs,
        visibleWorldSize
      );
    } else if (frame !== undefined) {
      setSpriteFrame(node.sprite, frame, visibleWorldSize);
    }
    node.body.visible = false;
    return true;
  }

  private applyWorldSprite(
    sprites: Map<string, Sprite>,
    id: string,
    key: string,
    x: number,
    y: number,
    visibleWorldSize: number
  ): boolean {
    const frame = this.spriteAtlas?.frame(key);
    const existing = sprites.get(id);
    if (frame === undefined) {
      if (existing !== undefined) {
        existing.visible = false;
      }
      return false;
    }

    const sprite = existing ?? new Sprite(frame.texture);
    if (existing === undefined) {
      sprites.set(id, sprite);
      this.world.addChild(sprite);
    }

    sprite.position.set(x, y);
    setSpriteFrame(sprite, frame, visibleWorldSize);
    return true;
  }

  private updateProjectiles(projectiles: readonly ProjView[], deltaMs: number): void {
    const seen = new Set<string>();

    for (const projectile of projectiles) {
      seen.add(projectile.id);
      const motion = this.updateProjectileMotion(projectile, deltaMs);
      let graphic = this.projectiles.get(projectile.id);

      if (graphic === undefined) {
        graphic = new Graphics();
        this.projectiles.set(projectile.id, graphic);
        this.world.addChild(graphic);
      }

      const spriteApplied = this.applyWorldSprite(
        this.projectileSprites,
        projectile.id,
        frameKey(projectileSpriteId(projectile.kind)),
        projectile.x,
        projectile.y,
        0.34
      );
      const sprite = this.projectileSprites.get(projectile.id);
      if (spriteApplied && sprite !== undefined) {
        this.applyProjectileMotion(projectile, motion, sprite, sprite.scale.x);
      }
      graphic.visible = !spriteApplied;
      if (!spriteApplied) {
        graphic.position.set(projectile.x, projectile.y);
        const fallbackKey =
          projectile.kind === "anchor_flail" || projectile.kind === "seagull_bell"
            ? projectile.kind
            : `${projectile.kind}|${projectile.faction}`;
        if (this.projectileFallbackKeys.get(projectile.id) !== fallbackKey) {
          drawProjectileFallback(graphic, projectile.kind, projectile.faction);
          this.projectileFallbackKeys.set(projectile.id, fallbackKey);
        }
        this.applyProjectileMotion(projectile, motion, graphic, 1);
      }
      this.maybeAddProjectileTrail(projectile, motion);
    }

    for (const [id, graphic] of this.projectiles) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.projectiles.delete(id);
        this.projectileFallbackKeys.delete(id);
        this.projectileMotion.delete(id);
      }
    }
    removeMissingSprites(this.projectileSprites, seen);
  }

  private updateProjectileMotion(
    projectile: ProjView,
    deltaMs: number
  ): ProjectileMotionState {
    let motion = this.projectileMotion.get(projectile.id);
    if (motion === undefined) {
      motion = {
        lastX: projectile.x,
        lastY: projectile.y,
        headingRad: 0,
        ageMs: 0,
        trailAccumMs: 0
      };
      this.projectileMotion.set(projectile.id, motion);
    } else if (!this.projectileMotionConfig(projectile).skipHeading) {
      const dx = projectile.x - motion.lastX;
      const dy = projectile.y - motion.lastY;
      if (dx * dx + dy * dy > 0.0001) {
        motion.headingRad = Math.atan2(dy, dx);
      }
    }

    motion.lastX = projectile.x;
    motion.lastY = projectile.y;
    motion.ageMs += deltaMs;
    motion.trailAccumMs += deltaMs;
    return motion;
  }

  private applyProjectileMotion(
    projectile: ProjView,
    motion: ProjectileMotionState,
    node: Container,
    baseScale: number
  ): void {
    const config = this.projectileMotionConfig(projectile);
    let rotation = config.spinMs === undefined ? 0 : motion.ageMs * config.spinMs;

    if (config.faceHeading) {
      rotation = motion.headingRad + (config.rotationOffset ?? 0);
    }
    if (config.wobble) {
      rotation += Math.sin(motion.ageMs * 0.02) * 0.08;
    }

    const arcScale =
      config.arcBob === true
        ? 1 + Math.sin(Math.min(1, motion.ageMs / 900) * Math.PI) * 0.35
        : 1;
    node.rotation = rotation;
    node.scale.set(baseScale * arcScale);
  }

  private maybeAddProjectileTrail(projectile: ProjView, motion: ProjectileMotionState): void {
    const config = this.projectileMotionConfig(projectile);
    if (config.noTrail || this.qualitySettings.particleMultiplier === 0) {
      motion.trailAccumMs = 0;
      return;
    }

    const intervalMs =
      this.qualitySettings.particleMultiplier <= 0.5
        ? PROJECTILE_TRAIL_INTERVAL_MS * 2
        : PROJECTILE_TRAIL_INTERVAL_MS;
    if (motion.trailAccumMs < intervalMs) {
      return;
    }

    motion.trailAccumMs -= intervalMs;
    const sprite = this.acquireVfxSprite("trailPuff");
    sprite.tint = config.trailTint;
    sprite.scale.set(0.07);
    this.particles.push({
      x: projectile.x,
      y: projectile.y,
      vx: 0,
      vy: 0,
      radius: 0.07,
      lifeMs: 260,
      color: config.trailTint,
      shape: "trailPuff",
      ageMs: 0,
      sprite
    });
  }

  private projectileMotionConfig(projectile: ProjView): ProjectileMotionConfig {
    if (projectile.kind === "anchor_flail") {
      return PROJECTILE_MOTION.anchor_flail!;
    }
    if (projectile.faction === "enemy") {
      return ENEMY_PROJECTILE_MOTION;
    }
    return PROJECTILE_MOTION[projectile.kind] ?? DEFAULT_PROJECTILE_MOTION;
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

      const spriteApplied = this.applyWorldSprite(
        this.pickupSprites,
        pickup.id,
        frameKey(pickup.kind),
        pickup.x,
        pickup.y,
        0.34
      );
      graphic.visible = !spriteApplied;
      if (!spriteApplied) {
        graphic.position.set(pickup.x, pickup.y);
        graphic
          .clear()
          .circle(0, 0, 0.16)
          .fill(pickup.kind === "coin" ? 0xffcf33 : 0xf3f0a5)
          .stroke({ color: 0x8f6400, width: 0.035 });
      }
    }

    for (const [id, graphic] of this.pickups) {
      if (!seen.has(id)) {
        graphic.destroy();
        this.pickups.delete(id);
      }
    }
    removeMissingSprites(this.pickupSprites, seen);
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
        this.releaseVfxSprite(pop.kind === "splash" ? "splashRing" : pop.kind === "repair" ? "repairRing" : "popRing", pop.sprite);
        this.pops.splice(index, 1);
        continue;
      }

      const t = pop.ageMs / pop.durationMs;
      const radius =
        pop.kind === "hit"
          ? 0.12 + t * 0.22
          : pop.kind === "explosion"
            ? 0.32 + t * 0.9
            : pop.kind === "scream"
              ? 0.3 + t * 1.4
            : pop.kind === "splash"
              ? 0.16 + t * 0.36
              : pop.kind === "repair"
                ? 0.14 + t * 0.24
              : 0.2 + t * 0.48;
      pop.sprite.position.set(pop.x, pop.y);
      pop.sprite.scale.set(radius);
      pop.sprite.alpha = 1 - t;
    }
  }

  private updateParticles(deltaMs: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.ageMs += deltaMs;

      if (particle.ageMs >= particle.lifeMs) {
        this.releaseVfxSprite(particleTextureKey(particle.shape), particle.sprite);
        this.particles.splice(index, 1);
        continue;
      }

      const t = particle.ageMs / particle.lifeMs;
      const x = particle.x + particle.vx * t;
      const y = particle.y + particle.vy * t + t * t * 0.22;
      particle.sprite.position.set(x, y);
      particle.sprite.alpha = 1 - t;
    }
  }

  private updatePickupFlies(deltaMs: number): void {
    for (let index = this.pickupFlies.length - 1; index >= 0; index -= 1) {
      const fly = this.pickupFlies[index]!;
      fly.ageMs += deltaMs;

      if (fly.ageMs >= PICKUP_FLY_MS) {
        this.releaseVfxSprite("pickupFlyOrb", fly.sprite);
        this.pickupFlies.splice(index, 1);
        continue;
      }

      const t = easeOutCubic(clamp01(fly.ageMs / PICKUP_FLY_MS));
      const x = fly.x + (fly.ownerX - fly.x) * t;
      const y = fly.y + (fly.ownerY - fly.y) * t - Math.sin(Math.PI * t) * 0.25;
      fly.sprite.position.set(x, y);
      fly.sprite.scale.set(0.12 + Math.sin(Math.PI * t) * 0.05);
      fly.sprite.alpha = 1 - t * 0.4;
    }
  }

  private updateRepairSupplyFlies(deltaMs: number): void {
    for (let index = this.repairSupplyFlies.length - 1; index >= 0; index -= 1) {
      const fly = this.repairSupplyFlies[index]!;
      fly.ageMs += deltaMs;

      if (fly.ageMs < 0) {
        fly.sprite.visible = false;
        continue;
      }
      fly.sprite.visible = true;

      if (fly.ageMs >= REPAIR_SUPPLY_FLY_MS) {
        this.releaseVfxSprite("supplyCrate", fly.sprite);
        this.repairSupplyFlies.splice(index, 1);
        continue;
      }

      const rawT = clamp01(fly.ageMs / REPAIR_SUPPLY_FLY_MS);
      const t = easeOutCubic(rawT);
      const x = fly.x + (fly.targetX - fly.x) * t;
      const y =
        fly.y +
        (fly.targetY - fly.y) * t -
        Math.sin(Math.PI * t) * 0.28 +
        Math.sin(rawT * Math.PI * 2 + fly.wobble) * 0.035;
      const alpha = 1 - Math.max(0, rawT - 0.74) / 0.26;
      const scale = 1.22 + Math.sin(Math.PI * rawT) * 0.32;

      fly.sprite.position.set(x, y);
      fly.sprite.rotation =
        (fly.targetX - fly.x) * 0.18 +
        Math.sin(rawT * Math.PI * 2 + fly.wobble) * 0.16;
      fly.sprite.scale.set(scale);
      fly.sprite.alpha = alpha;
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
    const key = kind === "splash" ? "splashRing" : kind === "repair" ? "repairRing" : "popRing";
    const sprite = this.acquireVfxSprite(key);
    sprite.tint = color;
    this.pops.push({ ageMs: 0, durationMs, sprite, x, y, color, kind });
  }

  private addParticles(kind: "kill" | "explosion" | "pickup", x: number, y: number): void {
    for (const spec of particleBurst(kind, x, y, this.qualitySettings.particleMultiplier)) {
      const sprite = this.acquireVfxSprite(particleTextureKey(spec.shape));
      sprite.tint = spec.color;
      sprite.scale.set(spec.radius);
      this.particles.push({ ...spec, ageMs: 0, sprite });
    }
  }

  private addParticle(spec: ParticleSpec): void {
    const sprite = this.acquireVfxSprite(particleTextureKey(spec.shape));
    sprite.tint = spec.color;
    sprite.scale.set(spec.radius);
    this.particles.push({ ...spec, ageMs: 0, sprite });
  }

  private updateLeaperSpray(enemy: EnemyView, deltaMs: number): void {
    const previousPosition = this.previousEnemyPositions.get(enemy.id);
    this.previousEnemyPositions.set(enemy.id, { x: enemy.x, y: enemy.y });
    if (enemy.kind !== "leaper") {
      this.enemySprayMs.delete(enemy.id);
      return;
    }

    if (this.qualitySettings.particleMultiplier <= 0 || previousPosition === undefined) {
      this.enemySprayMs.set(enemy.id, 0);
      return;
    }

    const moved = Math.hypot(enemy.x - previousPosition.x, enemy.y - previousPosition.y);
    if (moved <= LEAPER_FAST_DELTA_TILES) {
      this.enemySprayMs.set(enemy.id, 0);
      return;
    }

    const intervalMs = LEAPER_SPRAY_INTERVAL_MS / this.qualitySettings.particleMultiplier;
    const accumulatedMs = (this.enemySprayMs.get(enemy.id) ?? intervalMs) + deltaMs;
    if (accumulatedMs < intervalMs) {
      this.enemySprayMs.set(enemy.id, accumulatedMs);
      return;
    }

    this.enemySprayMs.set(enemy.id, accumulatedMs % intervalMs);
    this.addParticle({
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: 0,
      radius: 0.05,
      lifeMs: 240,
      color: 0xd9fbff,
      shape: "bubble"
    });
  }

  private addPickupFly(pickup: CollectedPickup): void {
    const sprite = this.acquireVfxSprite("pickupFlyOrb");
    sprite.tint = pickup.kind === "coin" ? 0xffcf33 : 0xf3f0a5;
    this.pickupFlies.push({
      ageMs: 0,
      sprite,
      kind: pickup.kind,
      x: pickup.x,
      y: pickup.y,
      ownerX: pickup.ownerX,
      ownerY: pickup.ownerY
    });
    this.addParticles("pickup", pickup.x, pickup.y);
  }

  private addRepairSupplyFliesForHpGain(
    tileKeyValue: string,
    hpGain: number,
    wasBroken: boolean,
    targetX: number,
    targetY: number
  ): number {
    const source = this.repairSources.get(tileKeyValue);
    if (source === undefined || hpGain <= 0) {
      return 0;
    }

    const hpPerSupply = wasBroken ? BROKEN_TILE_HP_PER_SUPPLY : DAMAGED_TILE_HP_PER_SUPPLY;
    const available = (this.repairSupplyRemainders.get(tileKeyValue) ?? 0) + hpGain / hpPerSupply;
    const supplyPackets = Math.floor(available);
    this.repairSupplyRemainders.set(tileKeyValue, available - supplyPackets);

    for (let index = 0; index < supplyPackets; index += 1) {
      const sprite = this.acquireVfxSprite("supplyCrate");
      this.repairSupplyFlies.push({
        ageMs: 0,
        sprite,
        x: source.x,
        y: source.y - 0.1,
        targetX,
        targetY,
        wobble: ((this.renderClockMs + index * 53) % 997) * 0.019
      });
    }
    return supplyPackets;
  }

  private acquireVfxSprite(key: VfxTextureKey): Sprite {
    let pool = this.vfxSpritePools.get(key);
    if (pool === undefined) {
      pool = [];
      this.vfxSpritePools.set(key, pool);
    }

    const sprite = pool.pop() ?? new Sprite(this.getVfxTexture(key));
    if (sprite.parent === null) {
      this.world.addChild(sprite);
    }
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.rotation = 0;
    sprite.tint = 0xffffff;
    sprite.scale.set(1);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  }

  private releaseVfxSprite(key: VfxTextureKey, sprite: Sprite): void {
    sprite.visible = false;
    sprite.alpha = 0;
    this.vfxSpritePools.get(key)?.push(sprite);
  }

  private getVfxTexture(key: VfxTextureKey): Texture {
    let texture = this.vfxTextures.get(key);
    if (texture !== undefined) {
      return texture;
    }

    const graphic = new Graphics();
    drawVfxTextureGraphic(graphic, key);
    // The geometry is authored at ~unit world size (1 unit = 1 tile = up to
    // ~60 screen px), so rasterize dense enough to stay crisp when a pop ring
    // scales up, and mipmap for the tiny far-downscaled particles.
    texture = this.app.renderer.generateTexture({ target: graphic, resolution: 48 });
    texture.source.autoGenerateMipmaps = true;
    graphic.destroy();
    this.vfxTextures.set(key, texture);
    return texture;
  }

  private updatePickupCollection(
    pickups: readonly PickupView[],
    players: readonly PlayerView[]
  ): CollectedPickup[] {
    const currentPickupIds = new Set(pickups.map((pickup) => pickup.id));
    for (const previousPickup of this.previousPickupRecords.values()) {
      if (!currentPickupIds.has(previousPickup.id)) {
        this.addThiefPickupRead(previousPickup);
      }
    }

    const collected = detectCollectedPickups(this.previousPickups, pickups, players);
    for (const pickup of collected) {
      this.addPickupFly(pickup);
    }
    this.previousPickups.length = 0;
    const seen = new Set<string>();
    for (const pickup of pickups) {
      seen.add(pickup.id);
      let record = this.previousPickupRecords.get(pickup.id);
      if (record === undefined) {
        record = { id: pickup.id, kind: pickup.kind, x: pickup.x, y: pickup.y };
        this.previousPickupRecords.set(pickup.id, record);
      } else {
        record.kind = pickup.kind;
        record.x = pickup.x;
        record.y = pickup.y;
      }
      this.previousPickups.push(record);
    }
    for (const id of this.previousPickupRecords.keys()) {
      if (!seen.has(id)) {
        this.previousPickupRecords.delete(id);
      }
    }
    return collected;
  }

  private addThiefPickupRead(pickup: PickupRecord): void {
    if (pickup.kind !== "coin") {
      return;
    }

    for (const [enemyId, kind] of this.enemyKinds) {
      if (kind !== "coin_thief") {
        continue;
      }
      const node = this.enemies.get(enemyId);
      if (node === undefined) {
        continue;
      }
      const dx = node.container.position.x - pickup.x;
      const dy = node.container.position.y - pickup.y;
      if (Math.hypot(dx, dy) <= 0.6) {
        this.addPop(pickup.x, pickup.y, 0xff6a6a, 200, "hit");
        return;
      }
    }
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
    if (!this.qualitySettings.screenShake) {
      return;
    }

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

function defeatTileOrder(tiles: RaftView["tiles"]): Map<string, number> {
  const centerX = (Math.max(...tiles.map((tile) => tile.col)) + 1) / 2;
  const centerY = (Math.max(...tiles.map((tile) => tile.row)) + 1) / 2;
  const ordered = [...tiles].sort((a, b) => {
    const aCore = a.kind === "core" ? 1 : 0;
    const bCore = b.kind === "core" ? 1 : 0;
    if (aCore !== bCore) {
      return aCore - bCore;
    }

    const aDistance = Math.hypot(a.col + 0.5 - centerX, a.row + 0.5 - centerY);
    const bDistance = Math.hypot(b.col + 0.5 - centerX, b.row + 0.5 - centerY);
    if (aDistance !== bDistance) {
      return bDistance - aDistance;
    }

    return a.row === b.row ? a.col - b.col : a.row - b.row;
  });

  return new Map(ordered.map((tile, index) => [tileKey(tile.col, tile.row), index]));
}

function sinkStateForTile(
  sink: DefeatSink,
  tile: RaftView["tiles"][number],
  nowMs: number
): { alpha: number; offsetY: number } {
  const order = sink.order.get(tileKey(tile.col, tile.row)) ?? 0;
  const ageMs = nowMs - sink.startedAtMs - order * DEFEAT_TILE_STAGGER_MS;
  if (ageMs <= 0) {
    return { alpha: 1, offsetY: 0 };
  }

  const progress = clamp01(ageMs / DEFEAT_TILE_SINK_MS);
  const eased = easeOutCubic(progress);
  return {
    alpha: 1 - eased * 0.92,
    offsetY: eased * 1.15
  };
}

interface HudRenderCache {
  values: Map<string, string>;
}

const hudRenderCaches = new WeakMap<HTMLElement, HudRenderCache>();

function nearestRepairTile(
  raft: RaftView,
  player: Pick<PlayerView, "x" | "y">
): RaftView["tiles"][number] | undefined {
  let selected: RaftView["tiles"][number] | undefined;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;
  const rangeSquared = 1.2 * 1.2;

  for (const tile of raft.tiles) {
    if (!tile.broken && tile.hpRatio >= 1) {
      continue;
    }

    const dx = tile.col + 0.5 - player.x;
    const dy = tile.row + 0.5 - player.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > rangeSquared || distanceSquared >= selectedDistanceSquared) {
      continue;
    }

    selected = tile;
    selectedDistanceSquared = distanceSquared;
  }

  return selected;
}

function drawTileAffordances(
  graphic: Graphics,
  tile: RaftView["tiles"][number],
  state: { repairing: boolean; needsSupply: boolean; buildTarget: boolean }
): void {
  const x = 0;
  const y = 0;

  if (tile.broken || tile.hpRatio < 1) {
    const hpRatio = clamp01(tile.hpRatio);
    graphic
      .rect(x + 0.08, y + 0.08, 0.84, 0.84)
      .stroke({ color: tile.broken ? 0xfff2a0 : 0xffdf7f, width: 0.035, alpha: 0.52 })
      .roundRect(x + 0.18, y + 0.78, 0.64, 0.08, 0.025)
      .fill({ color: 0x162832, alpha: 0.72 })
      .roundRect(x + 0.2, y + 0.8, 0.6 * hpRatio, 0.04, 0.02)
      .fill(tile.broken ? 0x9dffd7 : hpColor(hpRatio));
  }

  if (state.repairing) {
    graphic
      .rect(x + 0.12, y + 0.12, 0.76, 0.76)
      .stroke({ color: 0x9dffd7, width: 0.04, alpha: 0.67 })
      .circle(x + 0.5, y + 0.5, 0.0925)
      .fill({ color: 0xffcf66, alpha: 0.76 });
  }

  if (state.needsSupply) {
    graphic
      .rect(x + 0.12, y + 0.12, 0.76, 0.76)
      .stroke({ color: 0xff5e57, width: 0.045, alpha: 0.84 })
      .moveTo(x + 0.32, y + 0.32)
      .lineTo(x + 0.68, y + 0.68)
      .moveTo(x + 0.68, y + 0.32)
      .lineTo(x + 0.32, y + 0.68)
      .stroke({ color: 0xfff1d8, width: 0.035, alpha: 0.76, cap: "round" });
  }

  if (state.buildTarget) {
    graphic
      .rect(x + 0.1, y + 0.1, 0.8, 0.8)
      .stroke({ color: 0xf2c14e, width: 0.055, alpha: 0.85 })
      .circle(x + 0.5, y + 0.5, 0.18)
      .stroke({ color: 0xffffff, width: 0.035, alpha: 0.72 });
  }
}

function drawExpansionMarker(
  graphic: Graphics,
  color: number,
  width: number,
  alpha: number
): void {
  const min = 0.11;
  const max = 0.89;
  const dashA = 0.17;
  const dashB = 0.39;
  const dashC = 0.61;
  const dashD = 0.83;

  graphic
    .clear()
    .moveTo(dashA, min)
    .lineTo(dashB, min)
    .moveTo(dashC, min)
    .lineTo(dashD, min)
    .moveTo(dashA, max)
    .lineTo(dashB, max)
    .moveTo(dashC, max)
    .lineTo(dashD, max)
    .moveTo(min, dashA)
    .lineTo(min, dashB)
    .moveTo(min, dashC)
    .lineTo(min, dashD)
    .moveTo(max, dashA)
    .lineTo(max, dashB)
    .moveTo(max, dashC)
    .lineTo(max, dashD)
    .stroke({ color, width, alpha, cap: "round" })
    .moveTo(0.38, 0.5)
    .lineTo(0.62, 0.5)
    .moveTo(0.5, 0.38)
    .lineTo(0.5, 0.62)
    .stroke({ color, width: Math.max(0.025, width * 0.72), alpha: Math.min(1, alpha + 0.05), cap: "round" });
}

function drawHazard(graphic: Graphics, hazard: HazardView): void {
  graphic.clear();
  if (hazard.kind === "puddle") {
    drawPuddleHazard(graphic, hazard.radius);
  } else if (hazard.kind === "trap") {
    drawTrapHazard(graphic, hazard.radius);
  }
}

function drawPuddleHazard(graphic: Graphics, radius: number): void {
  graphic
    .ellipse(0, 0, radius, radius * 0.72)
    .fill({ color: 0x2f8fb3, alpha: 0.34 })
    .stroke({ color: 0x9fdcef, width: 0.03, alpha: 0.5 })
    .arc(-radius * 0.22, -radius * 0.1, radius * 0.24, Math.PI * 1.08, Math.PI * 1.58)
    .stroke({ color: 0xc8f4ff, width: 0.025, alpha: 0.42, cap: "round" })
    .arc(radius * 0.25, radius * 0.08, radius * 0.16, Math.PI * 0.1, Math.PI * 0.52)
    .stroke({ color: 0xc8f4ff, width: 0.02, alpha: 0.36, cap: "round" });
}

function drawTrapHazard(graphic: Graphics, radius: number): void {
  const jawRadius = radius * 0.72;
  graphic
    .circle(0, 0, radius * 0.36)
    .stroke({ color: 0x6b4a2b, width: radius * 0.16, alpha: 0.95 })
    .arc(0, 0, jawRadius, Math.PI * 0.12, Math.PI * 0.88)
    .stroke({ color: 0x9aa7b0, width: radius * 0.11, alpha: 0.96, cap: "round" })
    .arc(0, 0, jawRadius, Math.PI * 1.12, Math.PI * 1.88)
    .stroke({ color: 0x9aa7b0, width: radius * 0.11, alpha: 0.96, cap: "round" })
    .circle(0, 0, radius * 0.1)
    .fill(0xe8933a);

  drawTrapTeeth(graphic, radius, -1);
  drawTrapTeeth(graphic, radius, 1);
}

function drawTrapTeeth(graphic: Graphics, radius: number, side: -1 | 1): void {
  const baseY = side * radius * 0.34;
  for (const x of [-0.22, 0, 0.22]) {
    graphic
      .moveTo(x * radius, baseY)
      .lineTo(x * radius, side * radius * 0.08)
      .stroke({ color: 0xd9e5ec, width: radius * 0.045, alpha: 0.9, cap: "round" });
  }
}

function drawRaftTileBase(
  graphic: Graphics,
  tile: RaftView["tiles"][number],
  hpRatio: number,
  sinking: boolean
): void {
  const x = 0;
  const y = 0;

  if (tile.broken || sinking) {
    graphic
      .rect(x + 0.06, y + 0.06, 0.88, 0.88)
      .fill({ color: 0x317e9b, alpha: 0.72 })
      .stroke({ color: 0x8ed7ed, width: 0.025, alpha: 0.55 })
      .moveTo(x + 0.18, y + 0.54)
      .lineTo(x + 0.82, y + 0.46)
      .stroke({ color: 0xb9edf6, width: 0.025, alpha: 0.5 })
      .moveTo(x + 0.3, y + 0.28)
      .lineTo(x + 0.5, y + 0.48)
      .lineTo(x + 0.42, y + 0.7)
      .lineTo(x + 0.7, y + 0.82)
      .stroke({ color: 0xfff2a0, width: 0.03, alpha: sinking ? 0.7 : 0, cap: "round" });
    return;
  }

  const isCore = tile.kind === "core";
  const deckColor = blendColor(
    isCore ? 0x7f4f1b : 0x5b3421,
    isCore ? 0xd9a441 : 0xb87942,
    hpRatio
  );
  graphic
    .rect(x + 0.03, y + 0.03, 0.94, 0.94)
    .fill(deckColor)
    .stroke({ color: isCore ? 0xffec9f : 0x6f4425, width: isCore ? 0.055 : 0.035 });
  graphic
    .moveTo(x + 0.16, y + 0.5)
    .lineTo(x + 0.84, y + 0.5)
    .stroke({ color: isCore ? 0xffd77a : 0xd79a5d, width: 0.025, alpha: 0.7 });

  if (isCore) {
    graphic
      .circle(x + 0.5, y + 0.5, 0.3)
      .fill(0x7f4f1b)
      .stroke({ color: 0xffec9f, width: 0.045 })
      .roundRect(x + 0.16, y + 0.84, 0.68, 0.08, 0.025)
      .fill(0x2b1d1d)
      .roundRect(x + 0.18, y + 0.86, 0.64 * hpRatio, 0.04, 0.02)
      .fill(hpColor(hpRatio));
  } else if (hpRatio < 1) {
    graphic
      .moveTo(x + 0.24, y + 0.22)
      .lineTo(x + 0.48, y + 0.42)
      .lineTo(x + 0.36, y + 0.58)
      .lineTo(x + 0.68, y + 0.78)
      .stroke({ color: 0x2b1d1d, width: 0.035, alpha: 0.5, cap: "round" });
  }
}

function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function isSameTile(
  coord: TileCoord | undefined,
  tile: Pick<RaftView["tiles"][number], "col" | "row">
): boolean {
  return coord !== undefined && coord.col === tile.col && coord.row === tile.row;
}

function drawEnemy(node: EntityNode, enemy: EnemyView): void {
  const graphic = node.body;
  const key = `${enemy.kind}|${enemy.radius}`;
  if (node.enemyBodyKey === key) {
    return;
  }
  node.enemyBodyKey = key;
  graphic.clear();
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
  node: EntityNode,
  enemy: EnemyView,
  onDeck: boolean,
  timeMs: number,
  enemyWakes: boolean
): void {
  const graphic = node.ground;
  const r = enemy.radius;
  const key = `${onDeck ? "deck" : "water"}|${r}`;
  if (node.enemyGroundKey !== key) {
    node.enemyGroundKey = key;
    graphic.clear();
    if (onDeck) {
      graphic
        .ellipse(0, Math.max(0.16, r * 0.42), Math.max(0.24, r * 0.95), Math.max(0.1, r * 0.28))
        .fill({ color: 0x1b1712, alpha: 0.28 });
    } else {
      const rearX = -Math.max(0.18, r * 0.62);
      const rearY = Math.max(0.1, r * 0.26);
      const width = Math.max(0.28, r * 0.72);
      graphic
        .arc(rearX, rearY, width, Math.PI * 1.08, Math.PI * 1.86)
        .stroke({ color: 0xd9fbff, width: 0.035, cap: "round" })
        .arc(rearX + r * 0.28, rearY + r * 0.16, width * 0.72, Math.PI * 1.12, Math.PI * 1.78)
        .stroke({ color: 0xffffff, width: 0.025, alpha: 0.72, cap: "round" });
    }
  }

  if (onDeck) {
    graphic.visible = true;
    graphic.scale.set(1);
    graphic.alpha = 1;
    return;
  }

  graphic.visible = enemyWakes;
  if (!enemyWakes) {
    return;
  }

  const phase = (timeMs * 0.002 + (enemy.id.length % 7) * 0.19) % 1;
  graphic.scale.set(1 + phase * 0.42);
  graphic.alpha = 0.32 * (1 - phase * 0.45);
}

function countEntityGraphics(node: EntityNode): number {
  return (
    3 +
    (node.sprite === undefined ? 0 : 1) +
    (node.weaponVisual === undefined ? 0 : 1) +
    (node.weaponTrail === undefined ? 0 : 1) +
    (node.facing === undefined ? 0 : 1) +
    (node.hpBack === undefined ? 0 : 1) +
    (node.hpFill === undefined ? 0 : 1) +
    (node.label === undefined ? 0 : 1) +
    (node.reviveRing === undefined ? 0 : 1) +
    (node.bleedRing === undefined ? 0 : 1)
  );
}

function drawModule(graphic: Graphics, module: ModuleView): void {
  const x = module.col + 0.5;
  const y = module.row + 0.5;
  const ratio = clamp01(module.hpRatio);
  graphic.clear();

  if (module.defId === "repair_station") {
    graphic
      .roundRect(module.col + 0.22, module.row + 0.22, 0.56, 0.56, 0.08)
      .fill(0x7f5a27)
      .stroke({ color: 0xffe2a3, width: 0.04 })
      .rect(module.col + 0.31, module.row + 0.34, 0.38, 0.08)
      .fill(0xe9d7a0)
      .rect(module.col + 0.31, module.row + 0.5, 0.38, 0.08)
      .fill(0xd7c38a)
      .circle(x + 0.16, y - 0.04, 0.055)
      .fill(0x5f3d1a);
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
    const weaponVisual = withFacing ? new Graphics() : undefined;
    const weaponTrail = withFacing ? new Graphics() : undefined;
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
    if (weaponVisual !== undefined) {
      container.addChild(weaponVisual);
    }
    if (weaponTrail !== undefined) {
      container.addChild(weaponTrail);
    }
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
      weaponVisual,
      weaponTrail,
      weaponVisualDrawn: false,
      facing,
      hpBack,
      hpFill,
      label,
      reviveRing,
      bleedRing,
      downedRingsVisible: false,
      flash,
      flashVisible: false,
      flashMs: 0,
      reactionMs: 0,
      reactionDx: 0,
      reactionDy: 0,
      baseScale: 1,
      animStartMs: 0,
      animStateStartedAtMs: 0
    };
    map.set(id, node);
  }

  return node;
}

function drawPlayerLabel(node: EntityNode, text: string): void {
  if (node.label === undefined) {
    return;
  }

  if (node.label.text !== text) {
    node.label.text = text;
  }
  if (node.labelY !== -0.92) {
    node.label.position.set(0, -0.92);
    node.labelY = -0.92;
  }
}

function drawPlayerWeaponVisual(
  node: EntityNode,
  player: PlayerView,
  clockMs: number,
  swing: WeaponSwing | undefined
): void {
  const graphic = node.weaponVisual;
  const trail = node.weaponTrail;
  if (graphic === undefined) {
    return;
  }

  const showCutlass =
    !player.downed && (player.characterId === "captain" || player.weaponIds.includes("cutlass"));
  graphic.visible = showCutlass;
  if (trail !== undefined) {
    trail.visible = showCutlass;
  }
  if (!showCutlass) {
    graphic.position.set(0, 0);
    graphic.rotation = 0;
    node.weaponVisualDrawn = false;
    if (trail !== undefined) {
      trail.clear();
    }
    return;
  }

  if (!node.weaponVisualDrawn) {
    graphic.clear();
    drawFloatingCutlass(graphic);
    node.weaponVisualDrawn = true;
  }

  const phase = idPhase(player.id);
  const bob = Math.sin(clockMs * 0.006 + phase) * 0.035;
  const sway = Math.sin(clockMs * 0.0035 + phase) * 0.08;
  const swingAgeMs = swing === undefined ? Number.POSITIVE_INFINITY : clockMs - swing.startedAtMs;
  const swinging = swingAgeMs < CUTLASS_SWING_DURATION_MS;
  graphic.scale.set(1);

  if (swinging && swing !== undefined) {
    const progress = clamp01(swingAgeMs / CUTLASS_SWING_DURATION_MS);
    const eased = easeOutCubic(progress);
    const direction = Math.atan2(swing.dy, swing.dx);
    const bladeAngle = direction - 1.12 + eased * 2.24;
    const reach = 0.2 + Math.sin(progress * Math.PI) * 0.16;
    graphic.position.set(Math.cos(direction) * reach, Math.sin(direction) * reach - 0.02);
    graphic.rotation = bladeAngle;
    graphic.scale.set(1 + Math.sin(progress * Math.PI) * 0.18);
    if (trail !== undefined) {
      trail.clear();
      drawCutlassMotionTrail(trail, direction, progress);
    }
  } else {
    graphic.position.set(0.48 + Math.cos(clockMs * 0.0025 + phase) * 0.04, -0.18 + bob);
    graphic.rotation = -0.72 + sway;
    if (trail !== undefined) {
      trail.clear();
    }
  }
}

function drawCutlassMotionTrail(graphic: Graphics, direction: number, progress: number): void {
  const alpha = 1 - progress;
  const halfArc = 0.72;
  const start = direction - halfArc;
  const end = direction + halfArc;
  const radius = 0.74;
  const inner = 0.38;
  const steps = 8;

  graphic.moveTo(Math.cos(start) * inner, Math.sin(start) * inner);
  for (let step = 0; step <= steps; step += 1) {
    const angle = start + (end - start) * (step / steps);
    graphic.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  for (let step = steps; step >= 0; step -= 1) {
    const angle = start + (end - start) * (step / steps);
    graphic.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
  }
  graphic
    .fill({ color: 0xfff2a0, alpha: alpha * 0.22 })
    .stroke({ color: 0xffffff, width: 0.03, alpha: alpha * 0.58 });
}

function drawFloatingCutlass(graphic: Graphics): void {
  graphic
    .moveTo(-0.18, 0)
    .lineTo(0.01, 0)
    .stroke({ color: 0x6b3a19, width: 0.095, cap: "round" })
    .moveTo(-0.02, -0.13)
    .lineTo(-0.02, 0.13)
    .stroke({ color: 0xffc247, width: 0.07, cap: "round" })
    .moveTo(0, -0.04)
    .lineTo(0.46, -0.03)
    .lineTo(0.62, 0)
    .lineTo(0.46, 0.03)
    .lineTo(0, 0.04)
    .lineTo(0, -0.04)
    .fill(0xf8fbff)
    .stroke({ color: 0x26364c, width: 0.025 })
    .moveTo(0.1, -0.012)
    .lineTo(0.43, -0.008)
    .stroke({ color: 0xaec7df, width: 0.018, alpha: 0.75, cap: "round" });
}

function idPhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }
  return (hash / 360) * Math.PI * 2;
}

function drawEnemyLabel(node: EntityNode, enemy: EnemyView): void {
  if (node.label === undefined) {
    return;
  }

  const def = ENEMIES[enemy.kind as keyof typeof ENEMIES];
  const text = def?.name ?? enemy.kind;
  const y = -Math.max(0.82, enemy.radius + 0.44);
  if (node.label.text !== text) {
    node.label.text = text;
  }
  if (node.labelY !== y) {
    node.label.position.set(0, y);
    node.labelY = y;
  }
}

function drawDownedRings(node: EntityNode, player: PlayerView): void {
  if (!player.downed) {
    if (node.downedRingsVisible) {
      node.reviveRing?.clear();
      node.bleedRing?.clear();
      node.reviveRingKey = undefined;
      node.bleedRingKey = undefined;
      node.downedRingsVisible = false;
    }
    return;
  }

  const reviveRatio = clamp01(player.reviveProgressRatio ?? 0);
  const bleedRatio = clamp01(player.bleedOutRatio ?? 0);
  const reviveKey = Math.round(reviveRatio * 50);
  const bleedKey = Math.round(bleedRatio * 50);
  if (node.reviveRingKey !== reviveKey) {
    node.reviveRing?.clear();
    drawProgressArc(node.reviveRing, 0.58, reviveRatio, 0x8fffd2, 0.08);
    node.reviveRingKey = reviveKey;
  }
  if (node.bleedRingKey !== bleedKey) {
    node.bleedRing?.clear();
    drawProgressArc(node.bleedRing, 0.7, bleedRatio, 0xff6a6a, 0.06);
    node.bleedRingKey = bleedKey;
  }
  node.downedRingsVisible = true;
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
  const backKey = `${y}|${width}`;
  if (node.hpBackKey !== backKey) {
    node.hpBack?.clear().roundRect(-width / 2, y, width, 0.11, 0.03).fill(0x2b1d1d);
    node.hpBackKey = backKey;
  }
  const fillKey = `${Math.round(clamped * 100)}|${y}|${width}`;
  if (node.hpFillKey !== fillKey) {
    node.hpFill
      ?.clear()
      .roundRect(-width / 2 + 0.02, y + 0.02, Math.max(0, width - 0.04) * clamped, 0.07, 0.025)
      .fill(color);
    node.hpFillKey = fillKey;
  }
}

function drawEntityFlash(node: EntityNode, color: number, radius: number): void {
  if (node.flash === undefined || node.flashMs <= 0) {
    if (node.flashVisible) {
      node.flash?.clear();
      node.flashVisible = false;
      node.flashRadius = undefined;
      node.flashColor = undefined;
    }
    return;
  }

  const alpha = clamp01(node.flashMs / Math.max(HIT_FLASH_MS, PLAYER_HURT_FLASH_MS)) * 0.58;
  if (!node.flashVisible || node.flashRadius !== radius || node.flashColor !== color) {
    node.flash.clear().circle(0, 0, radius).fill(color);
    node.flashRadius = radius;
    node.flashColor = color;
    node.flashVisible = true;
  }
  node.flash.alpha = alpha;
}

function particleTextureKey(shape: ParticleVfx["shape"]): VfxTextureKey {
  if (shape === "trailPuff") {
    return "trailPuff";
  }
  if (shape === "bone") {
    return "particleBone";
  }
  if (shape === "spark") {
    return "particleSpark";
  }
  return shape === "coin" ? "particleCoin" : "particleBubble";
}

function drawVfxTextureGraphic(graphic: Graphics, key: VfxTextureKey): void {
  if (key === "popRing") {
    graphic.circle(0, 0, 1).stroke({ color: 0xffffff, width: 0.14 });
    return;
  }
  if (key === "splashRing") {
    graphic
      .circle(0, 0, 1)
      .stroke({ color: 0xffffff, width: 0.12 })
      .moveTo(-0.62, 0.11)
      .lineTo(-0.28, -0.22)
      .moveTo(0.28, -0.22)
      .lineTo(0.62, 0.11)
      .stroke({ color: 0xffffff, width: 0.08, alpha: 0.75, cap: "round" });
    return;
  }
  if (key === "repairRing") {
    graphic
      .circle(0, 0, 1)
      .stroke({ color: 0xffffff, width: 0.14 })
      .moveTo(-0.6, 0)
      .lineTo(0.6, 0)
      .moveTo(0, -0.6)
      .lineTo(0, 0.6)
      .stroke({ color: 0xffffff, width: 0.1, alpha: 0.9, cap: "round" });
    return;
  }
  if (key === "trailPuff") {
    graphic
      .circle(0, 0, 1)
      .fill({ color: 0xffffff, alpha: 0.34 })
      .circle(0.18, -0.12, 0.68)
      .fill({ color: 0xffffff, alpha: 0.22 });
    return;
  }
  if (key === "particleBone") {
    graphic
      .roundRect(-1.8, -0.45, 3.6, 0.9, 0.45)
      .fill(0xffffff)
      .circle(-1.7, 0, 0.72)
      .circle(1.7, 0, 0.72)
      .fill(0xffffff);
    return;
  }
  if (key === "particleSpark") {
    graphic
      .moveTo(-1.8, 0)
      .lineTo(1.8, 0)
      .moveTo(0, -1.8)
      .lineTo(0, 1.8)
      .stroke({ color: 0xffffff, width: 0.7, cap: "round" });
    return;
  }
  if (key === "particleCoin") {
    graphic.circle(0, 0, 1.25).fill(0xffffff).stroke({ color: 0x8f6400, width: 0.45 });
    return;
  }
  if (key === "particleBubble") {
    graphic.circle(0, 0, 1).fill({ color: 0xffffff, alpha: 0.2 }).stroke({ color: 0xffffff, width: 0.45 });
    return;
  }
  if (key === "pickupFlyOrb") {
    graphic
      .circle(0, 0, 1)
      .fill(0xffffff)
      .stroke({ color: 0xffffff, width: 0.25 })
      .moveTo(-1.83, 0)
      .lineTo(1.83, 0)
      .moveTo(0, -1.83)
      .lineTo(0, 1.83)
      .stroke({ color: 0xffffff, width: 0.2 });
    return;
  }

  graphic
    .roundRect(-0.14, -0.1, 0.28, 0.2, 0.035)
    .fill(0xffcf66)
    .stroke({ color: 0x7c4b19, width: 0.025 })
    .moveTo(-0.08, -0.09)
    .lineTo(-0.08, 0.09)
    .moveTo(0.08, -0.09)
    .lineTo(0.08, 0.09)
    .stroke({ color: 0xfff2a0, width: 0.016, alpha: 0.85 })
    .circle(0, 0, 0.04)
    .fill(0xeafff8);
}

function removeMissing(map: Map<string, EntityNode>, seen: ReadonlySet<string>): void {
  for (const [id, node] of map) {
    if (!seen.has(id)) {
      node.container.destroy({ children: true });
      map.delete(id);
    }
  }
}

function removeMissingSprites(map: Map<string, Sprite>, seen: ReadonlySet<string>): void {
  for (const [id, sprite] of map) {
    if (!seen.has(id)) {
      sprite.destroy();
      map.delete(id);
    }
  }
}

function hideEntitySprite(node: EntityNode): void {
  if (node.sprite !== undefined) {
    node.sprite.visible = false;
  }
  node.body.visible = true;
}

function resetEntityVisualTransform(node: EntityNode): void {
  node.body.scale.set(1);
  node.body.rotation = 0;
  if (node.sprite !== undefined) {
    node.sprite.rotation = 0;
  }
}

function playerAttackWindow(
  swing: WeaponSwing | undefined,
  clockMs: number
): { active: boolean; ageMs: number } {
  if (swing === undefined) {
    return { active: false, ageMs: Number.POSITIVE_INFINITY };
  }

  const ageMs = clockMs - swing.lastAttackMs;
  return { active: ageMs < PLAYER_ATTACK_READ_MS, ageMs };
}

function updateEntityAnimState(node: EntityNode, animState: string | undefined, clockMs: number): void {
  if (node.lastAnimState !== animState) {
    node.lastAnimState = animState;
    node.animStateStartedAtMs = clockMs;
  }
}

// Static preference lists — this runs per enemy per frame; don't allocate.
const PREFS_MOVE = ["move"] as const;
const PREFS_MOVE_IDLE = ["move", "idle"] as const;
const PREFS_ATTACK = ["attack", "move"] as const;
const PREFS_ATTACK_IDLE = ["attack", "move", "idle"] as const;
const PREFS_WINDUP = ["windup", "attack", "move"] as const;
const PREFS_WINDUP_IDLE = ["windup", "attack", "move", "idle"] as const;

function enemyAnimationPreferences(enemy: EnemyView): readonly string[] {
  const kraken = enemy.kind === "kraken_head" || enemy.kind === "kraken_tentacle";
  if (enemy.anim === "attack") {
    return kraken ? PREFS_ATTACK_IDLE : PREFS_ATTACK;
  }
  if (enemy.anim === "windup") {
    return kraken ? PREFS_WINDUP_IDLE : PREFS_WINDUP;
  }
  return kraken ? PREFS_MOVE_IDLE : PREFS_MOVE;
}

function applyEnemyProceduralAttackRead(node: EntityNode, enemy: EnemyView, clockMs: number): void {
  if (enemy.anim !== "windup" && enemy.anim !== "attack") {
    return;
  }

  const winningAnimation = node.spriteKey?.slice(enemy.kind.length + 1);
  if (winningAnimation === "attack" || winningAnimation === "windup") {
    return;
  }

  if (enemy.anim === "windup") {
    const phase = 0.5 + 0.5 * Math.sin((clockMs - node.animStateStartedAtMs) * 0.012);
    const direction = enemy.x < RAFT_SIZE_TILES / 2 ? -1 : 1;
    applyEntityVisualTransform(node, ENEMY_WINDUP_SCALE, direction * ENEMY_WINDUP_ROTATION * phase);
    return;
  }

  const ageMs = clockMs - node.animStateStartedAtMs;
  applyEntityVisualPulse(node, ageMs, ENEMY_ATTACK_READ_MS, ENEMY_ATTACK_PULSE_STRENGTH);
}

function applyEntityVisualPulse(
  node: EntityNode,
  ageMs: number,
  durationMs: number,
  strength: number
): void {
  applyEntityVisualTransform(node, popScale(ageMs, durationMs, strength), 0);
}

function applyEntityVisualTransform(node: EntityNode, scale: number, rotation: number): void {
  const visual = node.sprite?.visible === true ? node.sprite : node.body;
  visual.scale.set(visual.scale.x * scale, visual.scale.y * scale);
  visual.rotation += rotation;
}

function frameKey(assetId: string): string {
  return `${assetId}/idle`;
}

function enemySpriteWorldSize(enemy: EnemyView): number {
  if (enemy.kind === "kraken_head") {
    return Math.max(1.8, enemy.radius * 2.4);
  }
  if (enemy.kind === "kraken_tentacle") {
    return Math.max(1.35, enemy.radius * 2.8);
  }
  return Math.max(0.56, enemy.radius * 2.45);
}

function projectileSpriteId(kind: string): string {
  if (kind === "harpoon_gun") {
    return "harpoon_projectile";
  }
  if (kind === "coconut_launcher") {
    return "coconut_projectile";
  }
  if (kind === "cannon") {
    return "cannon_projectile";
  }
  return kind;
}

function drawProjectileFallback(
  graphic: Graphics,
  kind: string,
  faction: ProjView["faction"]
): void {
  if (kind === "anchor_flail") {
    drawAnchorFlailProjectile(graphic);
    return;
  }

  if (kind === "seagull_bell") {
    drawSeagullBellProjectile(graphic);
    return;
  }

  const isEnemy = faction === "enemy";
  graphic
    .clear()
    .circle(0, 0, isEnemy ? 0.13 : 0.09)
    .fill(isEnemy ? 0x7ee36d : 0xfff2a0)
    .stroke({ color: isEnemy ? 0x245820 : 0xffffff, width: 0.025 })
    .moveTo(isEnemy ? -0.18 : -0.26, 0)
    .lineTo(0.04, 0)
    .stroke({ color: isEnemy ? 0xb9ff9e : 0xffffff, width: 0.04, alpha: 0.65 });
}

function drawAnchorFlailProjectile(graphic: Graphics): void {
  graphic
    .clear()
    .circle(0, -0.21, 0.055)
    .stroke({ color: 0xaebfcd, width: 0.025 })
    .moveTo(0, -0.15)
    .lineTo(0, 0.18)
    .moveTo(-0.11, -0.03)
    .lineTo(0.11, -0.03)
    .moveTo(-0.18, 0.08)
    .quadraticCurveTo(-0.18, 0.24, -0.04, 0.22)
    .moveTo(0.18, 0.08)
    .quadraticCurveTo(0.18, 0.24, 0.04, 0.22)
    .stroke({ color: 0x3a4753, width: 0.055, cap: "round", join: "round" })
    .moveTo(0, -0.15)
    .lineTo(0, 0.17)
    .moveTo(-0.1, -0.03)
    .lineTo(0.1, -0.03)
    .stroke({ color: 0xaebfcd, width: 0.018, cap: "round" });
}

function drawSeagullBellProjectile(graphic: Graphics): void {
  graphic
    .clear()
    .ellipse(0, 0.04, 0.07, 0.17)
    .fill(0xf4f8fb)
    .stroke({ color: 0xaebfcd, width: 0.018 })
    .moveTo(-0.04, -0.03)
    .lineTo(-0.25, -0.18)
    .lineTo(-0.1, 0.04)
    .moveTo(0.04, -0.03)
    .lineTo(0.25, -0.18)
    .lineTo(0.1, 0.04)
    .fill(0xf4f8fb)
    .stroke({ color: 0xaebfcd, width: 0.018, join: "round" })
    .moveTo(-0.035, 0.19)
    .lineTo(0, 0.29)
    .lineTo(0.035, 0.19)
    .fill(0xe8933a);
}

function drawSlash(slash: SlashVfx): void {
  if (slash.weaponId === "cutlass") {
    drawCutlassSwing(slash);
    return;
  }

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

function drawCutlassSwing(slash: SlashVfx): void {
  const t = clamp01(slash.ageMs / SLASH_DURATION_MS);
  const eased = easeOutCubic(t);
  const direction = Math.atan2(slash.dy, slash.dx);
  const halfArc = (slash.arcDegrees * Math.PI) / 360;
  const start = direction - halfArc * 0.95;
  const end = direction + halfArc * 0.95;
  const bladeAngle = start + (end - start) * eased;
  const alpha = 1 - t;
  const hilt = 0.22;
  const tip = Math.min(slash.range * 0.95, 1.3);
  const guardRadius = 0.16;
  const handleLength = 0.22;
  const normal = bladeAngle + Math.PI / 2;
  const handleAngle = bladeAngle + Math.PI;

  const hiltX = Math.cos(bladeAngle) * hilt;
  const hiltY = Math.sin(bladeAngle) * hilt;
  const tipX = Math.cos(bladeAngle) * tip;
  const tipY = Math.sin(bladeAngle) * tip;
  const handleX = hiltX + Math.cos(handleAngle) * handleLength;
  const handleY = hiltY + Math.sin(handleAngle) * handleLength;

  slash.graphic.position.set(slash.ox, slash.oy);
  slash.graphic.clear();

  drawSwingTrail(slash.graphic, start, bladeAngle, tip, alpha);

  slash.graphic
    .moveTo(hiltX, hiltY)
    .lineTo(tipX, tipY)
    .stroke({ color: 0x26364c, width: 0.13, alpha: alpha * 0.95, cap: "round" })
    .moveTo(hiltX, hiltY)
    .lineTo(tipX, tipY)
    .stroke({ color: 0xf8fbff, width: 0.07, alpha, cap: "round" })
    .moveTo(hiltX + Math.cos(normal) * guardRadius, hiltY + Math.sin(normal) * guardRadius)
    .lineTo(hiltX - Math.cos(normal) * guardRadius, hiltY - Math.sin(normal) * guardRadius)
    .stroke({ color: 0xffc247, width: 0.075, alpha, cap: "round" })
    .moveTo(hiltX, hiltY)
    .lineTo(handleX, handleY)
    .stroke({ color: 0x6b3a19, width: 0.095, alpha, cap: "round" });
}

function drawSwingTrail(
  graphic: Graphics,
  start: number,
  end: number,
  radius: number,
  alpha: number
): void {
  const steps = 8;
  const inner = radius * 0.55;

  graphic.moveTo(Math.cos(start) * inner, Math.sin(start) * inner);
  for (let step = 0; step <= steps; step += 1) {
    const angle = start + (end - start) * (step / steps);
    graphic.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  for (let step = steps; step >= 0; step -= 1) {
    const angle = start + (end - start) * (step / steps);
    graphic.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
  }
  graphic
    .fill({ color: 0xfff2a0, alpha: alpha * 0.28 })
    .stroke({ color: 0xffffff, width: 0.035, alpha: alpha * 0.75 });
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
  const cache = getHudRenderCache(root);
  setHudText(root, cache, "status", "[data-status]", state.status);
  setHudText(root, cache, "wave", "[data-wave]", state.waveText);
  setHudText(root, cache, "phase", "[data-phase]", state.phaseText);
  setHudText(root, cache, "coins", "[data-coins]", state.coinsText);
  setHudText(root, cache, "salvage", "[data-salvage]", state.salvageText);
  setHudText(root, cache, "hpText", "[data-hp-text]", state.hpText);
  for (let index = 0; index < 4; index += 1) {
    const slotName = state.weaponSlots[index] ?? "";
    const slotText = slotName === "" ? "—" : slotName;
    setCachedStyle(cache, `weaponSlot${index}`, slotText, (value) => {
      const slot = root.querySelector<HTMLElement>(`[data-weapon-slot="${index}"]`);
      slot?.replaceChildren(value);
      slot?.classList.toggle("empty", slotName === "");
    });
  }

  const hpFill = root.querySelector<HTMLElement>("[data-hp-fill]");
  if (hpFill !== null) {
    const hpPercent = Math.round(state.hpRatio * 100);
    setCachedStyle(cache, "hpWidth", `${hpPercent}%`, (value) => {
      hpFill.style.width = value;
    });
    setCachedStyle(cache, "hpBackground", `linear-gradient(90deg, #dc3e40, #2cbe64 ${hpPercent}%)`, (value) => {
      hpFill.style.background = value;
    });
  }

  const bossHud = root.querySelector<HTMLElement>("[data-boss-hud]");
  const bossFill = root.querySelector<HTMLElement>("[data-boss-fill]");
  setCachedStyle(cache, "bossHidden", state.boss === null ? "1" : "0", (value) => {
    bossHud?.toggleAttribute("hidden", value === "1");
  });
  if (state.boss !== null) {
    setHudText(root, cache, "bossName", "[data-boss-name]", state.boss.name);
    setHudText(root, cache, "bossPhase", "[data-boss-phase]", state.boss.phaseText);
    if (bossFill !== null) {
      setCachedStyle(cache, "bossWidth", `${Math.round(state.boss.hpRatio * 100)}%`, (value) => {
        bossFill.style.width = value;
      });
    }
  }
}

function weaponDisplayName(id: string | undefined): string {
  if (id === undefined) {
    return "";
  }
  return WEAPONS[id as keyof typeof WEAPONS]?.name ?? id;
}

function getHudRenderCache(root: HTMLElement): HudRenderCache {
  let cache = hudRenderCaches.get(root);
  if (cache === undefined) {
    cache = { values: new Map() };
    hudRenderCaches.set(root, cache);
  }
  return cache;
}

function setHudText(
  root: HTMLElement,
  cache: HudRenderCache,
  key: string,
  selector: string,
  value: string
): void {
  if (cache.values.get(key) === value) {
    return;
  }
  root.querySelector<HTMLElement>(selector)?.replaceChildren(value);
  cache.values.set(key, value);
}

function setCachedStyle(
  cache: HudRenderCache,
  key: string,
  value: string,
  apply: (value: string) => void
): void {
  if (cache.values.get(key) === value) {
    return;
  }
  apply(value);
  cache.values.set(key, value);
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
