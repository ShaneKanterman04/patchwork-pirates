import { CHARACTERS, ITEMS, MODULES, WEAPONS } from "@patchwork/content";
import type { ClientMessage, PlayerView, ShopOfferView, Snapshot } from "@patchwork/protocol";
import { ProceduralAudio } from "./audio";
import type { LobbyViewModel } from "./coOpLogic";
import { characterName, lobbyViewModel, ownCanRevive, scoreboardRows } from "./coOpLogic";
import { INTERP_DELAY_MS, interpolate } from "./interp";
import type { InterpolatedState } from "./interp";
import { InputTracker } from "./input";
import { connect, resolveWsUrl } from "./net";
import type { Connection } from "./net";
import { GameRenderer, renderHud } from "./render";
import { applyEventsToStats, applySnapshotToStats, createRunStats } from "./runStats";
import type { RunStats } from "./runStats";
import { canAffordOffer, canPlaceOnTile, ownCoins, screenPointToTile } from "./shopLogic";

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
    .boss-hud { width: min(420px, calc(100vw - 28px)); margin-top: 8px; }
    .boss-hud[hidden] { display: none; }
    .boss-top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 6px; }
    .boss-name { font-weight: 900; letter-spacing: 0; text-transform: uppercase; }
    .boss-phase { font-size: 13px; font-weight: 800; text-align: right; }
    .boss-fill { height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #ff4f5e, #f7b955); }
    .shop { position: absolute; right: 16px; top: 16px; width: min(360px, calc(100vw - 32px)); color: #17202a; background: rgba(246, 248, 241, .94); border: 1px solid rgba(38, 54, 68, .25); border-radius: 8px; box-shadow: 0 12px 34px rgba(25, 39, 52, .28); padding: 12px; }
    .shop[hidden], .end-screen[hidden], .lobby[hidden], .scoreboard[hidden], .revive-hint[hidden] { display: none; }
    .shop-head, .shop-actions, .modules { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .shop-head { justify-content: space-between; margin-bottom: 10px; font-weight: 800; }
    .offers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .offer, .module-btn { border: 1px solid #bbc5c8; background: #fffdf6; border-radius: 8px; padding: 8px; min-height: 92px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; }
    .offer.sold { color: #6f7b83; background: #eef2ef; }
    .offer-title { font-weight: 800; font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
    .offer-meta { font-size: 12px; color: #48575f; }
    button { border: 1px solid #52636c; background: #17384b; color: #fff; border-radius: 7px; padding: 7px 9px; font-weight: 800; cursor: pointer; }
    button.secondary { background: #fff; color: #17384b; }
    button.selected { outline: 3px solid #f2c14e; }
    button:disabled { opacity: .46; cursor: not-allowed; }
    .card-actions { display: flex; gap: 6px; }
    .shop-actions { margin-top: 10px; justify-content: space-between; }
    .modules { margin-top: 10px; align-items: stretch; }
    .module-btn { min-height: 64px; color: #17202a; background: #edf7f3; flex: 1 1 150px; text-align: left; }
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
    .lobby-panel { width: min(560px, calc(100vw - 48px)); background: #f7f8f1; border-radius: 8px; padding: 20px; box-shadow: 0 16px 48px rgba(0,0,0,.34); }
    .lobby-panel h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.05; }
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
  </style>
  <div class="game-shell">
    <div class="hud" aria-live="polite">
      <div class="hud-row">
        <span class="status" data-status>connecting...</span>
        <span class="wave" data-wave>Wave 1</span>
        <span data-phase>Fight!</span>
        <span data-coins>Coins 0</span>
        <span data-salvage>Salvage 0</span>
      </div>
      <div class="hp">
        <div class="hp-label" data-hp-text>HP --</div>
        <div class="hp-track"><div class="hp-fill" data-hp-fill></div></div>
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
    <div class="revive-hint" data-revive-hint hidden>Hold E to revive</div>
    <div class="end-screen" data-end-screen hidden></div>
  </div>
`;

const shell = root.querySelector<HTMLElement>(".game-shell");
const shopEl = root.querySelector<HTMLElement>("[data-shop]");
const lobbyEl = root.querySelector<HTMLElement>("[data-lobby]");
const scoreboardEl = root.querySelector<HTMLElement>("[data-scoreboard]");
const reviveHintEl = root.querySelector<HTMLElement>("[data-revive-hint]");
const endScreenEl = root.querySelector<HTMLElement>("[data-end-screen]");
const soundToggleEl = root.querySelector<HTMLButtonElement>("[data-sound-toggle]");

if (shell === null || shopEl === null || lobbyEl === null || scoreboardEl === null || reviveHintEl === null || endScreenEl === null || soundToggleEl === null) {
  throw new Error("Missing game shell");
}

const renderer = await GameRenderer.create(shell);
const input = new InputTracker(window);
input.attach();
const audio = new ProceduralAudio();
audio.bindUnlock(window);

let stats: RunStats = createRunStats();
let latestState: InterpolatedState | undefined;
let selectedModuleId: string | undefined;
let locallyReady = false;
let lobbyRenderKey = "";
let previousWavePhase: InterpolatedState["wave"]["phase"] | undefined;
let previousOwnDowned = false;
let previousBossPhase: NonNullable<InterpolatedState["boss"]>["phase"] | undefined;

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

renderer.app.canvas.addEventListener("click", (event) => {
  if (latestState?.wave.phase !== "build" || selectedModuleId === undefined) {
    return;
  }

  const rect = renderer.app.canvas.getBoundingClientRect();
  const tile = screenPointToTile(
    { x: event.clientX - rect.left, y: event.clientY - rect.top },
    renderer.viewportTransform(),
    latestState.raft
  );

  if (tile === undefined || !canPlaceOnTile(latestState.raft, tile)) {
    return;
  }

  connection.sendInput({ type: "place_module", defId: selectedModuleId, col: tile.col, row: tile.row });
  selectedModuleId = undefined;
});

renderer.app.ticker.add((ticker) => {
  const renderTimeMs = performance.now() - INTERP_DELAY_MS;
  const state = interpolate(connection.snapshots, renderTimeMs);
  latestState = state;
  stats = applySnapshotToStats(stats, connection.latestSnapshot, connection.myPlayerId);

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

  renderLobby(lobbyEl, lobbyModel, connection);
  root.querySelector<HTMLElement>(".hud")?.toggleAttribute("hidden", lobbyModel.inLobby);

  if (state.wave.phase !== "build") {
    selectedModuleId = undefined;
    locallyReady = false;
  }

  if (state.wave.phase === "combat" || state.wave.phase === "build") {
    if (input.consumePingPressed()) {
      connection.sendPing();
    }
    connection.sendInput(input.nextInput());
  } else {
    input.consumePingPressed();
  }

  renderHud(root, renderer.hudState(state, connection.myPlayerId, connection.status));
  renderShop(shopEl, state, connection.latestSnapshot, connection.myPlayerId, connection.sendInput);
  renderScoreboard(scoreboardEl, state.players, connection.myPlayerId, input.isScoreboardHeld() && lobbyModel.activeRun);
  reviveHintEl.hidden = !ownCanRevive(state.players, connection.myPlayerId);
  renderEndScreen(endScreenEl, state, stats);
});

window.addEventListener("beforeunload", () => {
  connection.close();
  renderer.destroy();
});

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
  state: InterpolatedState,
  snapshot: Snapshot | undefined,
  myPlayerId: string | undefined,
  send: (message: ClientMessage) => void
): void {
  if (state.wave.phase !== "build") {
    shop.hidden = true;
    return;
  }

  const ownPlayer = state.players.find((player) => player.id === myPlayerId);
  const serverPlayer = snapshot?.players.find((player) => player.id === myPlayerId);
  const player = ownPlayer ?? serverPlayer;
  const playerShop = player?.shop;
  const coins = ownCoins(player);
  const salvage = state.salvage ?? snapshot?.salvage ?? 0;

  shop.hidden = false;
  shop.replaceChildren();

  const head = el("div", "shop-head");
  head.append(el("span", undefined, "Build Shop"), el("span", undefined, `Ready in ${Math.ceil(state.wave.timeLeft)}s`));
  shop.append(head);

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
  for (const moduleDef of Object.values(MODULES)) {
    const moduleButton = button(`${moduleDef.name} ${moduleDef.salvageCost}`, () => {
      selectedModuleId = selectedModuleId === moduleDef.id ? undefined : moduleDef.id;
    });
    moduleButton.className = "module-btn";
    moduleButton.disabled = salvage < moduleDef.salvageCost;
    moduleButton.classList.toggle("selected", selectedModuleId === moduleDef.id);
    moduleWrap.append(moduleButton);
  }
  shop.append(moduleWrap);
  shop.append(el("div", "placement", selectedModuleId === undefined ? "" : "Click an intact deck tile to place it."));
}

function renderLobby(container: HTMLElement, model: LobbyViewModel, connection: Connection): void {
  container.hidden = !model.inLobby;

  if (!model.inLobby) {
    return;
  }

  const rejoin = connection.rejoin;
  const key = JSON.stringify({
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
  panel.append(el("h1", undefined, "Patchwork Pirates"));

  if (model.code === undefined) {
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
      panel.append(el("div", "lobby-message", rejoin.available ? "Disconnected slot found." : "Previous slot found."), rejoinButton);
    }

    container.append(panel);
    return;
  }

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
  panel.append(el("p", connection.lobby.error === undefined ? "lobby-message" : "lobby-message lobby-error", connection.lobby.error ?? model.statusText), ready);

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
    return;
  }

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

  for (const row of scoreboardRows(players, myPlayerId, CHARACTERS)) {
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
  card.append(
    el("div", "offer-title", title ?? offer.defId),
    el("div", "offer-meta", `${offer.kind} - ${offer.price} coins`)
  );

  const actions = el("div", "card-actions");
  const buyBtn = button("Buy", () => send({ type: "buy", index }));
  buyBtn.disabled = !canAffordOffer(offer, coins, weaponCount);
  const lockBtn = button(player?.shop?.locked[index] ? "Locked" : "Lock", () => send({ type: "lock", index }));
  lockBtn.className = "secondary";
  lockBtn.classList.toggle("selected", player?.shop?.locked[index] ?? false);
  actions.append(buyBtn, lockBtn);
  card.append(actions);

  return card;
}

function renderEndScreen(container: HTMLElement, state: InterpolatedState, runStats: RunStats): void {
  if (state.wave.phase !== "victory" && state.wave.phase !== "defeat") {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  const isVictory = state.wave.phase === "victory";
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
