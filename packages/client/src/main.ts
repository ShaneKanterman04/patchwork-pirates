import { CHARACTERS, ITEMS, MODULES, TILE_BUILD_SALVAGE_COST, WEAPONS } from "@patchwork/content";
import type { ClientMessage, PlayerView, ShopOfferView, Snapshot } from "@patchwork/protocol";
import { ProceduralAudio } from "./audio";
import type { LobbyViewModel, Screen } from "./coOpLogic";
import { characterName, currentScreen, lobbyViewModel, ownCanRevive, scoreboardRows } from "./coOpLogic";
import { HINT_COPY, nextHint, readSeenHints, resetSeenHints, writeSeenHints } from "./hints";
import type { HintId, HintView } from "./hints";
import { INTERP_DELAY_MS, interpolate } from "./interp";
import type { InterpolatedState } from "./interp";
import { InputTracker } from "./input";
import { connect, resolveWsUrl } from "./net";
import type { Connection } from "./net";
import { createQualityMonitor, settingsForTier } from "./quality";
import type { QualityTier } from "./quality";
import { GameRenderer, renderHud } from "./render";
import { applyEventsToStats, applySnapshotToStats, createRunStats } from "./runStats";
import type { RunStats } from "./runStats";
import {
  characterLabel,
  itemModifiersText,
  optionalItemIds,
  ownedItemText,
  playerStatText,
  purchaseSnapshot,
  purchaseToastText,
  sellRefund,
  weaponStackText,
  weaponStatLine
} from "./shopReadability";
import type { PurchaseSnapshot } from "./shopReadability";
import { canAffordOffer, nearestBuildTile, nearestExpansionSite, ownCoins } from "./shopLogic";

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <style>
    html, body, #app { margin: 0; width: 100%; height: 100%; overflow: hidden; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .game-shell { position: relative; width: 100vw; height: 100vh; background: #5ca9c9; }
    .game-canvas { display: block; width: 100%; height: 100%; }
    .hud { position: absolute; top: 14px; left: 14px; min-width: 270px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.45); pointer-events: none; }
    .hud[hidden] { display: none; }
    .hud-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
    .hud-row span, .hp, .boss-hud { background: rgba(16, 43, 58, .72); border: 1px solid rgba(255,255,255,.22); border-radius: 8px; padding: 6px 9px; }
    .hud-pulse { animation: hudPulse 260ms ease-out; }
    .sound-toggle { position: absolute; right: 16px; bottom: 16px; min-width: 88px; }
    @keyframes hudPulse { 0% { transform: scale(1); } 35% { transform: scale(1.12); } 100% { transform: scale(1); } }
    .hp { width: 230px; }
    .hp-label { font-weight: 700; font-size: 13px; margin-bottom: 5px; }
    .hp-track { height: 10px; border-radius: 999px; background: #2a2730; overflow: hidden; }
    .hp-fill { height: 100%; width: 0%; border-radius: 999px; }
    .weapon-slots { display: flex; flex-direction: row; gap: 6px; margin-top: 8px; }
    .weapon-slot { background: rgba(16, 43, 58, .72); border: 1px solid rgba(255,255,255,.22); border-radius: 8px; padding: 4px 8px 6px; font-size: 12px; font-weight: 700; min-width: 64px; text-align: center; }
    .weapon-slot.empty { opacity: .45; }
    .boss-hud { width: min(420px, calc(100vw - 28px)); margin-top: 8px; }
    .boss-hud[hidden] { display: none; }
    .boss-top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 6px; }
    .boss-name { font-weight: 900; letter-spacing: 0; text-transform: uppercase; }
    .boss-phase { font-size: 13px; font-weight: 800; text-align: right; }
    .boss-fill { height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #ff4f5e, #f7b955); }
    .shop { position: absolute; right: 16px; top: 16px; width: min(390px, calc(100vw - 32px)); color: #17202a; background: rgba(246, 248, 241, .94); border: 1px solid rgba(38, 54, 68, .25); border-radius: 8px; box-shadow: 0 12px 34px rgba(25, 39, 52, .28); padding: 12px; }
    .shop[hidden], .end-screen[hidden], .lobby[hidden], .scoreboard[hidden], .revive-hint[hidden], .hint-toast[hidden], .buy-toast[hidden] { display: none; }
    .shop-head, .shop-actions, .modules { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .shop-head { justify-content: space-between; margin-bottom: 10px; font-weight: 800; }
    .gear-panel { border: 1px solid #c9d3d2; background: #edf7f3; border-radius: 8px; padding: 8px; margin-bottom: 10px; display: grid; gap: 4px; font-size: 12px; color: #31444c; }
    .gear-panel strong { color: #162832; font-size: 14px; }
    .gear-line { overflow-wrap: anywhere; }
    .gear-weapon { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .gear-weapon span { overflow-wrap: anywhere; }
    .gear-weapon button { padding: 4px 7px; white-space: nowrap; }
    .offers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .offer, .module-btn { border: 1px solid #bbc5c8; background: #fffdf6; border-radius: 8px; padding: 8px; min-height: 116px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; }
    .offer.sold { color: #6f7b83; background: #eef2ef; }
    .offer-title { font-weight: 800; font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
    .offer-desc { font-size: 12px; line-height: 1.25; color: #263942; }
    .offer-meta { font-size: 12px; color: #48575f; }
    button { border: 1px solid #52636c; background: #17384b; color: #fff; border-radius: 7px; padding: 7px 9px; font-weight: 800; cursor: pointer; }
    button.secondary { background: #fff; color: #17384b; }
    button.selected { outline: 3px solid #f2c14e; }
    button:disabled { opacity: .46; cursor: not-allowed; }
    .card-actions { display: flex; gap: 6px; }
    .shop-actions { margin-top: 10px; justify-content: space-between; }
    .modules { margin-top: 10px; align-items: stretch; }
    .module-btn { min-height: 78px; color: #17202a; background: #edf7f3; flex: 1 1 150px; text-align: left; }
    .module-name { font-weight: 900; }
    .module-desc { font-size: 12px; color: #465b63; line-height: 1.25; }
    .placement { margin-top: 8px; color: #24424d; font-size: 13px; min-height: 18px; }
    .end-screen { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(13, 28, 38, .72); color: #fff; padding: 24px; }
    .end-panel { width: min(520px, calc(100vw - 48px)); background: #f7f8f1; color: #15242d; border-radius: 8px; padding: 22px; box-shadow: 0 16px 48px rgba(0,0,0,.34); }
    .end-panel h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.05; }
    .end-panel p { margin: 0 0 16px; color: #3f535d; }
    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .stat { border: 1px solid #c8d1d4; border-radius: 8px; padding: 10px; background: #fffdf6; }
    .stat strong { display: block; font-size: 24px; }
    .stat span { color: #53636b; font-size: 13px; }
    .lobby { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(17, 38, 48, .78); color: #15242d; padding: 24px; }
    .lobby.menu { background-color: #112630; background-image: url("/assets/ui/menu-water.png"); background-size: cover; background-position: center; }
    .lobby-panel { width: min(560px, calc(100vw - 48px)); background: #f7f8f1; border-radius: 8px; padding: 20px; box-shadow: 0 16px 48px rgba(0,0,0,.34); }
    .lobby-panel h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.05; }
    .title-image { display: block; width: min(420px, 100%); height: auto; margin: 0 0 12px; }
    .lobby-code { display: inline-block; margin: 10px 0; padding: 8px 12px; border: 2px dashed #38515b; border-radius: 8px; font-size: 26px; font-weight: 900; letter-spacing: 3px; background: #fffdf6; }
    .lobby-actions, .character-select, .roster { display: flex; gap: 8px; flex-wrap: wrap; align-items: stretch; }
    .lobby-actions input { min-width: 120px; flex: 1; border: 1px solid #aeb9bd; border-radius: 7px; padding: 8px 10px; font-size: 15px; text-transform: uppercase; }
    .lobby-message { min-height: 20px; color: #4b5d66; margin: 8px 0 12px; }
    .lobby-error { color: #b33131; font-weight: 800; }
    .roster { margin: 12px 0; }
    .roster-player { flex: 1 1 180px; border: 1px solid #c8d1d4; border-radius: 8px; padding: 10px; background: #fffdf6; }
    .roster-player strong { display: block; margin-bottom: 4px; }
    .scoreboard { position: absolute; inset: 0; display: grid; place-items: start center; padding-top: 72px; background: rgba(9, 20, 28, .42); color: #17202a; pointer-events: none; }
    .scoreboard-panel { width: min(760px, calc(100vw - 32px)); background: rgba(247, 248, 241, .96); border-radius: 8px; padding: 14px; box-shadow: 0 14px 42px rgba(0,0,0,.3); }
    .scoreboard-panel h2 { margin: 0 0 10px; font-size: 22px; }
    .score-row { display: grid; grid-template-columns: 1.2fr .8fr .7fr repeat(3, .8fr); gap: 8px; align-items: center; padding: 8px; border-top: 1px solid #d4dcde; font-size: 14px; }
    .score-row.header { font-weight: 900; border-top: 0; color: #52636c; }
    .score-name strong { display: block; }
    .score-name span { color: #65767d; font-size: 12px; }
    .revive-hint { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); color: #fff; background: rgba(16,43,58,.84); border: 1px solid rgba(255,255,255,.28); border-radius: 8px; padding: 9px 12px; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,.4); pointer-events: none; }
    .hint-toast { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); width: min(520px, calc(100vw - 32px)); color: #fffdf6; background: rgba(18, 48, 61, .9); border: 1px solid rgba(255,255,255,.3); border-radius: 8px; box-shadow: 0 8px 24px rgba(8, 22, 31, .26); padding: 10px 14px; font-weight: 900; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,.34); pointer-events: none; }
    .buy-toast { position: absolute; left: 50%; top: 72px; transform: translateX(-50%); width: min(520px, calc(100vw - 32px)); color: #15242d; background: rgba(255, 253, 246, .96); border: 1px solid rgba(38,54,68,.24); border-radius: 8px; box-shadow: 0 8px 24px rgba(8, 22, 31, .22); padding: 9px 13px; font-weight: 900; text-align: center; pointer-events: none; }
  </style>
  <div class="game-shell">
    <div class="hud" aria-live="polite">
      <div class="hud-row">
        <span class="status" data-status>connecting...</span>
        <span class="wave" data-wave>Wave 1</span>
        <span data-phase>Fight!</span>
        <span data-coins>Coins 0</span>
        <span data-salvage>Supplies 0/20</span>
      </div>
      <div class="hp">
        <div class="hp-label" data-hp-text>HP --</div>
        <div class="hp-track"><div class="hp-fill" data-hp-fill></div></div>
      </div>
      <div class="weapon-slots" data-weapon-slots>
        <span class="weapon-slot" data-weapon-slot="0"></span>
        <span class="weapon-slot" data-weapon-slot="1"></span>
        <span class="weapon-slot" data-weapon-slot="2"></span>
        <span class="weapon-slot" data-weapon-slot="3"></span>
      </div>
      <div class="boss-hud" data-boss-hud hidden>
        <div class="boss-top">
          <span class="boss-name" data-boss-name>The Kraken</span>
          <span class="boss-phase" data-boss-phase></span>
        </div>
        <div class="hp-track"><div class="boss-fill" data-boss-fill></div></div>
      </div>
    </div>
    <div class="shop" data-shop hidden></div>
    <button class="sound-toggle secondary" data-sound-toggle type="button">Sound on</button>
    <div class="lobby" data-lobby></div>
    <div class="scoreboard" data-scoreboard hidden></div>
    <div class="hint-toast" data-hint-toast aria-live="polite" hidden></div>
    <div class="buy-toast" data-buy-toast aria-live="polite" hidden></div>
    <div class="revive-hint" data-revive-hint hidden>Hold E to revive</div>
    <div class="end-screen" data-end-screen hidden></div>
  </div>
`;

const shell = root.querySelector<HTMLElement>(".game-shell");
const shopEl = root.querySelector<HTMLElement>("[data-shop]");
const lobbyEl = root.querySelector<HTMLElement>("[data-lobby]");
const scoreboardEl = root.querySelector<HTMLElement>("[data-scoreboard]");
const hintToastEl = root.querySelector<HTMLElement>("[data-hint-toast]");
const buyToastEl = root.querySelector<HTMLElement>("[data-buy-toast]");
const reviveHintEl = root.querySelector<HTMLElement>("[data-revive-hint]");
const endScreenEl = root.querySelector<HTMLElement>("[data-end-screen]");
const soundToggleEl = root.querySelector<HTMLButtonElement>("[data-sound-toggle]");

if (shell === null || shopEl === null || lobbyEl === null || scoreboardEl === null || hintToastEl === null || buyToastEl === null || reviveHintEl === null || endScreenEl === null || soundToggleEl === null) {
  throw new Error("Missing game shell");
}

const hintToast = hintToastEl;
const buyToast = buyToastEl;
const renderer = await GameRenderer.create(shell);
const qualityMonitor = createQualityMonitor();
let currentQualityTier: QualityTier = "high";
renderer.applyQuality(settingsForTier(currentQualityTier));
const input = new InputTracker(window);
input.attach();
const audio = new ProceduralAudio();
audio.bindUnlock(window);

let stats: RunStats = createRunStats();
let locallyReady = false;
let lobbyRenderKey = "";
let lastLobbyKeyCheckMs = 0;
let lobbyRenderVisible = false;
let shopRenderKey: string | null = null;
let lastShopKeyCheckMs = 0;
let scoreboardRenderKey = "";
let lastScoreboardKeyCheckMs = 0;
let scoreboardRenderVisible = false;
let endRenderKey = "";
let previousWavePhase: InterpolatedState["wave"]["phase"] | undefined;
let previousScreen: Screen | undefined;
let previousOwnDowned = false;
let previousBossPhase: NonNullable<InterpolatedState["boss"]>["phase"] | undefined;
let combatStartedAtMs: number | undefined;
let previousOwnCoins: number | undefined;
let previousPurchaseState: PurchaseSnapshot | undefined;
let previousShopOffers: ShopOfferView[] = [];
let activeBuyToast: { text: string; dismissAtMs: number } | undefined;
const perfOverlay = createPerfOverlay(shell);
const perfFrames: number[] = [];
let lastPerfOverlayMs = 0;

if (new URLSearchParams(window.location.search).has("resethints")) {
  resetSeenHints();
}

const seenHints = readSeenHints();
const hintQueue: HintId[] = [];
let activeHint: { id: HintId; dismissAtMs: number } | undefined;

const connection = connect(
  resolveWsUrl(window.location, import.meta.env.VITE_WS_URL),
  (events) => {
    stats = applyEventsToStats(stats, events);
    renderer.pushEvents(events);
    for (const event of events) {
      audio.playEvent(event);
    }
  }
);

soundToggleEl.addEventListener("click", () => {
  audio.setMuted(!audio.isMuted);
  soundToggleEl.textContent = audio.isMuted ? "Sound off" : "Sound on";
});

renderer.app.ticker.add((ticker) => {
  const nowMs = performance.now();
  const nextQualityTier = qualityMonitor.sample(ticker.deltaMS, nowMs);
  if (nextQualityTier !== currentQualityTier) {
    currentQualityTier = nextQualityTier;
    renderer.applyQuality(settingsForTier(currentQualityTier));
  }

  recordPerfFrame(perfFrames, ticker.deltaMS);
  const renderTimeMs = nowMs - INTERP_DELAY_MS;
  const state = interpolate(connection.snapshots, renderTimeMs);
  stats = applySnapshotToStats(stats, connection.latestSnapshot, connection.myPlayerId);
  renderer.setBuildTarget(buildTargetFor(state, connection.myPlayerId));
  if (state.wave.phase === "defeat") {
    renderer.startDefeatSink(state.raft);
  } else {
    renderer.resetDefeatSink();
  }

  const collectedPickups = renderer.update(state, connection.myPlayerId, ticker.deltaMS);
  for (const pickup of collectedPickups) {
    audio.play("coin");
    pulseHudValue(root, pickup.kind === "salvage" ? "[data-salvage]" : "[data-coins]");
  }
  playStateAudioCues(state, connection.myPlayerId);
  const lobbyModel = lobbyViewModel({
    lobbyCode: connection.lobby.code,
    lobbyPlayers: connection.lobby.players,
    canStart: connection.lobby.canStart,
    myPlayerId: connection.myPlayerId,
    snapshot: connection.latestSnapshot
  });
  const screen = currentScreen({
    lobbyCode: connection.lobby.code,
    wavePhase: connection.latestSnapshot?.wave.phase,
    defeatRevealDone: renderer.defeatSinkComplete()
  });
  if (
    (previousScreen === "game" || previousScreen === "end") &&
    (screen === "menu" || screen === "lobbyRoom")
  ) {
    resetRunState();
  }
  previousScreen = screen;

  renderLobby(lobbyEl, screen, lobbyModel, connection);
  root.querySelector<HTMLElement>(".hud")?.toggleAttribute("hidden", screen !== "game");

  if (screen !== "game" || state.wave.phase !== "build") {
    locallyReady = false;
  }

  if (screen === "game" && (state.wave.phase === "combat" || state.wave.phase === "build")) {
    if (input.consumePingPressed()) {
      connection.sendPing();
    }
    const frameInput = input.nextInput();
    dismissHintForInput(frameInput);
    connection.sendInput(frameInput);
  } else {
    input.consumePingPressed();
  }

  if (screen === "game") {
    updateHints(state, connection.myPlayerId, nowMs);
  } else {
    activeHint = undefined;
    renderHintToast(nowMs);
  }
  renderHud(root, renderer.hudState(state, connection.myPlayerId, connection.status));
  renderShop(shopEl, screen, state, connection.latestSnapshot, connection.myPlayerId, connection.sendInput);
  if (screen === "game") {
    updatePurchaseToast(state, connection.myPlayerId, nowMs);
  } else {
    renderBuyToast(nowMs);
  }
  renderScoreboard(scoreboardEl, state.players, connection.myPlayerId, input.isScoreboardHeld() && screen === "game");
  reviveHintEl.hidden = screen !== "game" || !ownCanRevive(state.players, connection.myPlayerId);
  renderEndScreen(endScreenEl, screen, state, stats, connection.sendInput);
  updatePerfOverlay(perfOverlay, perfFrames, currentQualityTier, nowMs);
});

window.addEventListener("beforeunload", () => {
  connection.close();
  renderer.destroy();
});

function updateHints(
  state: InterpolatedState,
  myPlayerId: string | undefined,
  nowMs: number
): void {
  const view = hintViewFromState(state, myPlayerId, nowMs);
  const id = nextHint(seenHints, view);
  if (id !== null) {
    enqueueHint(id);
  }

  previousOwnCoins = state.players.find((player) => player.id === myPlayerId)?.coins;
  renderHintToast(nowMs);
}

function resetRunState(): void {
  stats = createRunStats();
  locallyReady = false;
  combatStartedAtMs = undefined;
  previousOwnCoins = undefined;
  previousPurchaseState = undefined;
  previousShopOffers = [];
  activeBuyToast = undefined;
  renderer.resetDefeatSink();
}

function hintViewFromState(
  state: InterpolatedState,
  myPlayerId: string | undefined,
  nowMs: number
): HintView {
  if (state.wave.phase === "combat") {
    combatStartedAtMs ??= nowMs;
  } else {
    combatStartedAtMs = undefined;
  }

  const ownPlayer = state.players.find((player) => player.id === myPlayerId);
  const ownCoinsValue = ownPlayer?.coins;
  const combatAgeMs =
    state.wave.phase === "combat" && combatStartedAtMs !== undefined ? nowMs - combatStartedAtMs : 0;

  return {
    inCombat: state.wave.phase === "combat",
    combatAgeMs,
    nearDamagedTile:
      ownPlayer !== undefined && isDamagedRaftTileNearPlayer(state.raft, ownPlayer.x, ownPlayer.y),
    coinsIncreased:
      previousOwnCoins !== undefined &&
      ownCoinsValue !== undefined &&
      ownCoinsValue > previousOwnCoins,
    inBuildPhase: state.wave.phase === "build",
    canExpandRaft:
      state.wave.phase === "build" && Math.floor(state.salvage ?? 0) >= TILE_BUILD_SALVAGE_COST,
    teammateDowned:
      state.players.length > 1 &&
      state.players.some((player) => player.id !== myPlayerId && player.downed && !(player.out ?? false)),
    bossPresent: state.boss !== null && state.boss !== undefined
  };
}

function enqueueHint(id: HintId): void {
  if (seenHints.has(id)) {
    return;
  }

  seenHints.add(id);
  writeSeenHints(seenHints);
  hintQueue.push(id);
}

function renderHintToast(nowMs: number): void {
  if (activeHint !== undefined && nowMs >= activeHint.dismissAtMs) {
    activeHint = undefined;
  }

  if (activeHint === undefined) {
    const next = hintQueue.shift();
    if (next !== undefined) {
      activeHint = { id: next, dismissAtMs: nowMs + 6_000 };
    }
  }

  hintToast.hidden = activeHint === undefined;
  hintToast.textContent = activeHint === undefined ? "" : HINT_COPY[activeHint.id];
}

function updatePurchaseToast(
  state: InterpolatedState,
  myPlayerId: string | undefined,
  nowMs: number
): void {
  const ownPlayer = state.players.find((player) => player.id === myPlayerId);
  const current = purchaseSnapshot(ownPlayer);
  const toastText = purchaseToastText(previousPurchaseState, current, previousShopOffers);

  if (toastText !== undefined) {
    activeBuyToast = { text: toastText, dismissAtMs: nowMs + 2_500 };
  }

  previousPurchaseState = current;
  previousShopOffers = [...(ownPlayer?.shop?.offers ?? [])];
  renderBuyToast(nowMs);
}

function renderBuyToast(nowMs: number): void {
  if (activeBuyToast !== undefined && nowMs >= activeBuyToast.dismissAtMs) {
    activeBuyToast = undefined;
  }

  buyToast.hidden = activeBuyToast === undefined;
  buyToast.textContent = activeBuyToast?.text ?? "";
}

function createPerfOverlay(parent: HTMLElement): HTMLDivElement | undefined {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "perf") {
    return undefined;
  }

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "12px";
  overlay.style.right = "12px";
  overlay.style.zIndex = "20";
  overlay.style.padding = "8px 10px";
  overlay.style.border = "1px solid rgba(255,255,255,.22)";
  overlay.style.borderRadius = "8px";
  overlay.style.background = "rgba(10, 24, 34, .78)";
  overlay.style.color = "#fff";
  overlay.style.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  overlay.style.lineHeight = "1.35";
  overlay.style.whiteSpace = "pre";
  overlay.style.pointerEvents = "none";
  parent.append(overlay);
  return overlay;
}

function recordPerfFrame(frames: number[], frameMs: number): void {
  frames.push(frameMs);
  if (frames.length > 120) {
    frames.shift();
  }
}

function updatePerfOverlay(
  overlay: HTMLDivElement | undefined,
  frames: readonly number[],
  tier: QualityTier,
  nowMs: number
): void {
  if (overlay === undefined || nowMs - lastPerfOverlayMs < 250 || frames.length === 0) {
    return;
  }

  lastPerfOverlayMs = nowMs;
  const graphicsAlive = renderer.perfStats().graphicsAlive;
  const average = frames.reduce((total, frame) => total + frame, 0) / frames.length;
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  const fps = average > 0 ? 1_000 / average : 0;
  overlay.textContent = `FPS ${fps.toFixed(0)}\nframe ${average.toFixed(1)} / ${p95.toFixed(1)} ms\ntier ${tier}\ngfx: ${graphicsAlive}`;
}

function dismissHintForInput(message: ClientMessage): void {
  if (activeHint === undefined || message.type !== "player_input") {
    return;
  }

  if (
    (activeHint.id === "move" &&
      (message.movement.x !== 0 || message.movement.y !== 0)) ||
    (activeHint.id === "dash" && message.dash) ||
    (activeHint.id === "revive" && message.interact)
  ) {
    activeHint = undefined;
  }
}

function isDamagedRaftTileNearPlayer(
  raft: InterpolatedState["raft"],
  playerX: number,
  playerY: number
): boolean {
  const tiles = raft?.tiles ?? [];

  return tiles.some((tile) => {
    if (!tile.broken && tile.hpRatio >= 1) {
      return false;
    }

    return Math.hypot(tile.col + 0.5 - playerX, tile.row + 0.5 - playerY) <= 1.45;
  });
}

function playStateAudioCues(
  state: InterpolatedState,
  myPlayerId: string | undefined
): void {
  if (previousWavePhase !== "combat" && state.wave.phase === "combat") {
    audio.play("wave");
  }
  previousWavePhase = state.wave.phase;

  const ownPlayer = state.players.find((player) => player.id === myPlayerId);
  const ownDowned = ownPlayer?.downed ?? false;
  if (!previousOwnDowned && ownDowned) {
    audio.play("downed");
  }
  previousOwnDowned = ownDowned;

  const bossPhase = state.boss?.phase;
  if (previousBossPhase !== "head" && bossPhase === "head") {
    audio.play("boss");
  }
  previousBossPhase = bossPhase;
}

function pulseHudValue(rootNode: HTMLElement, selector: string): void {
  const node = rootNode.querySelector<HTMLElement>(selector);
  if (node === null) {
    return;
  }

  node.classList.remove("hud-pulse");
  void node.offsetWidth;
  node.classList.add("hud-pulse");
}

function renderShop(
  shop: HTMLElement,
  screen: Screen,
  state: InterpolatedState,
  snapshot: Snapshot | undefined,
  myPlayerId: string | undefined,
  send: (message: ClientMessage) => void
): void {
  if (screen !== "game" || state.wave.phase !== "build") {
    shop.hidden = true;
    shopRenderKey = null;
    return;
  }

  const ownPlayer = state.players.find((player) => player.id === myPlayerId);
  const serverPlayer = snapshot?.players.find((player) => player.id === myPlayerId);
  const player = ownPlayer ?? serverPlayer;
  const playerShop = player?.shop;
  const coins = ownCoins(player);
  const salvage = state.salvage ?? snapshot?.salvage ?? 0;
  const buildTarget = buildTargetFor(state, myPlayerId);
  const expansionTarget = nearestExpansionSite(state.raft, ownPlayer);

  shop.hidden = false;

  // The render loop runs every frame; rebuilding the shop DOM each time would
  // destroy the buttons between mousedown and mouseup, making them unclickable.
  // Only rebuild when the meaningful state changes (offers/funds/selection);
  // otherwise just refresh the volatile countdown text in place.
  const countdown = shop.querySelector<HTMLElement>("[data-shop-timer]");
  if (countdown !== null) {
    countdown.textContent = `Ready in ${Math.ceil(state.wave.timeLeft)}s`;
  }
  const nowMs = performance.now();
  if (
    shopRenderKey !== null &&
    shop.childElementCount > 0 &&
    nowMs - lastShopKeyCheckMs < 250
  ) {
    return;
  }
  lastShopKeyCheckMs = nowMs;

  const key = JSON.stringify({
    offers: playerShop?.offers ?? [],
    locked: playerShop?.locked ?? [],
    rerollCost: playerShop?.rerollCost ?? 0,
    coins,
    salvage,
    ready: locallyReady,
    buildTarget: buildTarget ?? null,
    expansionTarget: expansionTarget ?? null,
    characterId: player?.characterId ?? null,
    weaponIds: player?.weaponIds ?? [],
    itemIds: optionalItemIds(player) ?? null,
    hp: player === undefined ? null : [Math.ceil(player.hp), Math.ceil(player.maxHp)],
    stats: player?.stats ?? null
  });

  if (key === shopRenderKey && shop.childElementCount > 0) {
    return;
  }
  shopRenderKey = key;

  shop.replaceChildren();

  const head = el("div", "shop-head");
  const timer = el("span", undefined, `Ready in ${Math.ceil(state.wave.timeLeft)}s`);
  timer.setAttribute("data-shop-timer", "");
  head.append(el("span", undefined, "Build Shop"), timer);
  shop.append(head);
  shop.append(renderGearPanel(player, send));

  const offers = el("div", "offers");
  const offerViews = playerShop?.offers ?? [];
  for (let index = 0; index < 4; index += 1) {
    offers.append(renderOffer(offerViews[index] ?? { kind: "sold" }, index, player, send));
  }
  shop.append(offers);

  const actions = el("div", "shop-actions");
  const reroll = button(`Reroll ${playerShop?.rerollCost ?? 0}`, () => send({ type: "reroll" }));
  reroll.disabled = playerShop === undefined || coins < playerShop.rerollCost;
  const ready = button(locallyReady ? "Ready" : "Ready Up", () => {
    locallyReady = !locallyReady;
    send({ type: "ready", ready: locallyReady });
  });
  ready.classList.toggle("selected", locallyReady);
  actions.append(reroll, ready);
  shop.append(actions);

  const moduleWrap = el("div", "modules");
  const buildTileButton = button("", () => {
    const currentOwnPlayer = state.players.find((candidate) => candidate.id === myPlayerId);
    const target = nearestExpansionSite(state.raft, currentOwnPlayer);
    if (target !== undefined) {
      send({ type: "build_tile", col: target.col, row: target.row });
    }
  });
  buildTileButton.className = "module-btn";
  buildTileButton.disabled = expansionTarget === undefined || salvage < TILE_BUILD_SALVAGE_COST;
  buildTileButton.append(
    el("span", "module-name", `Build Deck Tile - ${TILE_BUILD_SALVAGE_COST} Supplies`),
    el("span", "module-desc", "Expand the raft at the highlighted water edge.")
  );
  moduleWrap.append(buildTileButton);

  for (const moduleDef of Object.values(MODULES)) {
    const moduleButton = button("", () => {
      const target = buildTargetFor(state, myPlayerId);
      if (target !== undefined) {
        send({ type: "place_module", defId: moduleDef.id, col: target.col, row: target.row });
      }
    });
    moduleButton.className = "module-btn";
    moduleButton.disabled = salvage < moduleDef.salvageCost || buildTarget === undefined;
    moduleButton.append(
      el("span", "module-name", `Build ${moduleDef.name} - ${moduleDef.salvageCost} Supplies`),
      el("span", "module-desc", moduleDef.description)
    );
    moduleWrap.append(moduleButton);
  }
  shop.append(moduleWrap);
  shop.append(el("div", "placement", placementText(buildTarget, expansionTarget, salvage)));
}

function renderGearPanel(player: PlayerView | undefined, send: (message: ClientMessage) => void): HTMLElement {
  const panel = el("div", "gear-panel");
  panel.append(
    el("strong", undefined, "Your gear"),
    el("div", "gear-line", `Character: ${characterLabel(player?.characterId)}`),
    el("div", "gear-line", weaponStackText(player?.weaponIds ?? [])),
    el("div", "gear-line", ownedItemText(player)),
    el("div", "gear-line", playerStatText(player))
  );

  const weaponIds = player?.weaponIds ?? [];
  const keepOneWeapon = weaponIds.length <= 1;
  for (const [index, weaponId] of weaponIds.entries()) {
    const row = el("div", "gear-weapon");
    const refund = sellRefund(weaponId, WEAPONS);
    const sellButton = button(
      keepOneWeapon ? "Keep at least one weapon" : `Sell +${refund ?? 0}`,
      () => send({ type: "sell_weapon", index })
    );
    sellButton.className = "secondary";
    sellButton.disabled = keepOneWeapon || refund === undefined;
    row.append(el("span", undefined, displayName(WEAPONS, weaponId) ?? weaponId), sellButton);
    panel.append(row);
  }

  return panel;
}

function buildTargetFor(
  state: InterpolatedState,
  myPlayerId: string | undefined
): ReturnType<typeof nearestBuildTile> {
  if (state.wave.phase !== "build") {
    return undefined;
  }

  const player = state.players.find((candidate) => candidate.id === myPlayerId);
  return nearestBuildTile(state.raft, state.modules, player);
}

function placementText(
  buildTarget: ReturnType<typeof nearestBuildTile>,
  expansionTarget: ReturnType<typeof nearestExpansionSite>,
  supplies: number
): string {
  if (expansionTarget !== undefined) {
    return `Deck expansion target: row ${expansionTarget.row + 1}, col ${expansionTarget.col + 1}. Supplies available: ${Math.floor(supplies)}.`;
  }

  if (buildTarget === undefined) {
    return "Stand near an empty deck tile to build modules, or a water edge to expand the raft.";
  }

  return `Building target: row ${buildTarget.row + 1}, col ${buildTarget.col + 1}. Supplies available: ${Math.floor(supplies)}.`;
}

function renderLobby(container: HTMLElement, screen: Screen, model: LobbyViewModel, connection: Connection): void {
  const visible = screen === "menu" || screen === "lobbyRoom";
  container.hidden = !visible;
  container.classList.toggle("menu", screen === "menu");

  if (!visible) {
    lobbyRenderVisible = false;
    return;
  }

  const rejoin = connection.rejoin;
  const lobbyBecameVisible = !lobbyRenderVisible;
  lobbyRenderVisible = true;
  const nowMs = performance.now();
  if (
    !lobbyBecameVisible &&
    container.childElementCount > 0 &&
    nowMs - lastLobbyKeyCheckMs < 250
  ) {
    return;
  }
  lastLobbyKeyCheckMs = nowMs;

  const key = JSON.stringify({
    screen,
    code: model.code,
    players: model.players,
    canStart: model.canStart,
    myPlayerId: connection.myPlayerId,
    error: connection.lobby.error,
    status: connection.status,
    rejoin
  });

  if (key === lobbyRenderKey) {
    return;
  }

  lobbyRenderKey = key;
  container.replaceChildren();
  const panel = el("div", "lobby-panel");

  if (screen === "menu") {
    const title = document.createElement("img");
    title.className = "title-image";
    title.src = "/assets/ui/title.png";
    title.alt = "Patchwork Pirates";
    title.onerror = () => {
      title.replaceWith(el("h1", undefined, "Patchwork Pirates"));
    };
    panel.append(title);
    panel.append(el("p", "lobby-message", connection.lobby.error ?? model.statusText));
    if (connection.lobby.error !== undefined) {
      panel.lastElementChild?.classList.add("lobby-error");
    }

    const actions = el("div", "lobby-actions");
    const create = button("Create lobby", () => connection.createLobby());
    const inputEl = document.createElement("input");
    inputEl.placeholder = "CODE";
    inputEl.maxLength = 6;
    inputEl.autocomplete = "off";
    const join = button("Join", () => connection.joinLobby(inputEl.value));
    actions.append(create, inputEl, join);
    panel.append(actions);

    if (rejoin !== undefined) {
      const rejoinButton = button(`Rejoin ${rejoin.code}`, () => connection.rejoinStored());
      rejoinButton.className = "secondary";
      panel.append(
        el("div", "lobby-message", rejoin.available ? "Disconnected slot found." : "Previous slot found."),
        rejoinButton
      );
    }

    container.append(panel);
    return;
  }

  panel.append(el("h1", undefined, "Patchwork Pirates"));
  panel.append(el("div", "lobby-message", "Share this code with your teammate."));
  panel.append(el("div", "lobby-code", model.code));

  const roster = el("div", "roster");
  for (const player of model.players) {
    const card = el("div", "roster-player");
    card.append(
      el("strong", undefined, player.id === connection.myPlayerId ? "You" : "Teammate"),
      el("div", undefined, characterName(player.characterId, CHARACTERS)),
      el("div", undefined, player.ready ? "Ready" : "Not ready")
    );
    roster.append(card);
  }
  panel.append(roster);

  const characters = el("div", "character-select");
  for (const character of Object.values(CHARACTERS)) {
    const characterButton = button(character.name, () => connection.selectCharacter(character.id));
    characterButton.classList.toggle("selected", model.ownPlayer?.characterId === character.id);
    characters.append(characterButton);
  }
  panel.append(characters);

  const ready = button(model.ownPlayer?.ready ? "Ready" : "Ready Up", () => {
    connection.setLobbyReady(!(model.ownPlayer?.ready ?? false));
  });
  ready.classList.toggle("selected", model.ownPlayer?.ready ?? false);
  const back = button("Back to Menu", () => {
    connection.sendInput({ type: "leave" } as ClientMessage);
  });
  back.className = "secondary";
  panel.append(
    el("p", connection.lobby.error === undefined ? "lobby-message" : "lobby-message lobby-error", connection.lobby.error ?? model.statusText),
    ready,
    back
  );

  if (rejoin !== undefined && rejoin.available) {
    const rejoinButton = button(`Rejoin ${rejoin.code}`, () => connection.rejoinStored());
    rejoinButton.className = "secondary";
    panel.append(rejoinButton);
  }

  container.append(panel);
}

function renderScoreboard(
  container: HTMLElement,
  players: readonly PlayerView[],
  myPlayerId: string | undefined,
  visible: boolean
): void {
  container.hidden = !visible;
  if (!visible) {
    scoreboardRenderVisible = false;
    return;
  }

  const scoreboardBecameVisible = !scoreboardRenderVisible;
  scoreboardRenderVisible = true;
  const nowMs = performance.now();
  if (
    !scoreboardBecameVisible &&
    container.childElementCount > 0 &&
    nowMs - lastScoreboardKeyCheckMs < 250
  ) {
    return;
  }
  lastScoreboardKeyCheckMs = nowMs;

  const rows = scoreboardRows(players, myPlayerId, CHARACTERS);
  const key = JSON.stringify({ visible, rows });
  if (key === scoreboardRenderKey && container.childElementCount > 0) {
    return;
  }
  scoreboardRenderKey = key;

  container.replaceChildren();
  const panel = el("div", "scoreboard-panel");
  panel.append(el("h2", undefined, "Crew"));
  const header = el("div", "score-row header");
  header.append(
    el("div", undefined, "Player"),
    el("div", undefined, "HP"),
    el("div", undefined, "Coins"),
    el("div", undefined, "Damage"),
    el("div", undefined, "Repairs"),
    el("div", undefined, "Revives")
  );
  panel.append(header);

  for (const row of rows) {
    const node = el("div", "score-row");
    const name = el("div", "score-name");
    name.append(el("strong", undefined, row.characterName), el("span", undefined, `${row.label}${row.out ? " - out" : row.downed ? " - downed" : ""}`));
    node.append(
      name,
      el("div", undefined, row.hpText),
      el("div", undefined, String(row.coins)),
      el("div", undefined, String(Math.round(row.damageDealt))),
      el("div", undefined, String(row.tilesRepaired)),
      el("div", undefined, String(row.revives))
    );
    panel.append(node);
  }

  container.append(panel);
}

function renderOffer(
  offer: ShopOfferView,
  index: number,
  player: PlayerView | undefined,
  send: (message: ClientMessage) => void
): HTMLElement {
  const card = el("div", `offer ${offer.kind === "sold" ? "sold" : ""}`);
  const coins = ownCoins(player);
  const weaponCount = player?.weaponIds.length ?? 0;

  if (offer.kind === "sold") {
    card.append(el("div", "offer-title", "Sold"), el("div", "offer-meta", "Empty slot"));
    return card;
  }

  const title =
    offer.kind === "weapon"
      ? displayName(WEAPONS, offer.defId)
      : displayName(ITEMS, offer.defId);
  const description =
    offer.kind === "weapon"
      ? WEAPONS[offer.defId as keyof typeof WEAPONS]?.description ?? "Weapon upgrade"
      : itemDefText(offer.defId);
  const statLine =
    offer.kind === "weapon"
      ? weaponDefText(offer.defId)
      : `${offer.price} coins`;
  const owned =
    offer.kind === "weapon"
      ? player?.weaponIds.filter((id) => id === offer.defId).length ?? 0
      : 0;
  const slotsFull = offer.kind === "weapon" && weaponCount >= 4;
  card.append(
    el("div", "offer-title", title ?? offer.defId),
    el("div", "offer-desc", description),
    el("div", "offer-meta", statLine),
    el("div", "offer-meta", `${offer.price} coins${owned > 0 ? ` · Owned x${owned} - stacks!` : ""}`)
  );
  if (slotsFull) {
    card.append(el("div", "offer-meta", "Sell a weapon in Your Gear to make room."));
  }

  const actions = el("div", "card-actions");
  const buyBtn = button(slotsFull ? "Slots full" : "Buy", () => send({ type: "buy", index }));
  buyBtn.disabled = !canAffordOffer(offer, coins, weaponCount);
  const lockBtn = button(player?.shop?.locked[index] ? "Locked" : "Lock", () => send({ type: "lock", index }));
  lockBtn.className = "secondary";
  lockBtn.classList.toggle("selected", player?.shop?.locked[index] ?? false);
  actions.append(buyBtn, lockBtn);
  card.append(actions);

  return card;
}

function itemDefText(defId: string): string {
  const item = ITEMS[defId as keyof typeof ITEMS];
  return item === undefined ? "Item upgrade" : itemModifiersText(item.modifiers);
}

function weaponDefText(defId: string): string {
  const weapon = WEAPONS[defId as keyof typeof WEAPONS];
  return weapon === undefined ? "Weapon stats unavailable" : weaponStatLine(weapon);
}

function renderEndScreen(
  container: HTMLElement,
  screen: Screen,
  state: InterpolatedState,
  runStats: RunStats,
  send: (message: ClientMessage) => void
): void {
  if (screen !== "end") {
    container.hidden = true;
    endRenderKey = "";
    return;
  }

  container.hidden = false;
  const isVictory = state.wave.phase === "victory";
  const key = JSON.stringify({
    phase: state.wave.phase,
    wave: state.wave.number,
    stats: runStats
  });
  if (key === endRenderKey && container.childElementCount > 0) {
    return;
  }
  endRenderKey = key;
  container.replaceChildren();
  const panel = el("div", "end-panel");
  panel.append(
    el("h1", undefined, isVictory ? "You survived all 8 waves!" : "The raft went down"),
    el("p", undefined, isVictory ? "A full run, screenshottable and seaworthy." : `The raft went down at Wave ${state.wave.number} - nice run!`)
  );

  const statGrid = el("div", "stats");
  statGrid.append(
    stat(runStats.enemiesSunk, "Enemies sunk"),
    stat(runStats.tilesRepaired, "Tiles repaired"),
    stat(runStats.wavesReached, "Waves reached"),
    stat(runStats.finalCoins, "Final coins"),
    stat(runStats.finalSalvage, "Final salvage")
  );
  panel.append(statGrid);
  const actions = el("div", "lobby-actions");
  actions.append(
    button("Play Again", () => send({ type: "rematch" } as ClientMessage)),
    (() => {
      const back = button("Back to Menu", () => send({ type: "leave" } as ClientMessage));
      back.className = "secondary";
      return back;
    })()
  );
  panel.append(actions);
  container.append(panel);
}

function stat(value: number, label: string): HTMLElement {
  const node = el("div", "stat");
  node.append(el("strong", undefined, String(value)), el("span", undefined, label));
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function displayName(registry: Record<string, { name: string }>, id: string): string | undefined {
  return registry[id]?.name;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
