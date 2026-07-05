import { ITEMS, MODULES, WEAPONS } from "@patchwork/content";
import type { ClientMessage, PlayerView, ShopOfferView, Snapshot } from "@patchwork/protocol";
import { INTERP_DELAY_MS, interpolate } from "./interp";
import type { InterpolatedState } from "./interp";
import { InputTracker } from "./input";
import { connect, resolveWsUrl } from "./net";
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
    .hud-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
    .hud-row span, .hp { background: rgba(16, 43, 58, .72); border: 1px solid rgba(255,255,255,.22); border-radius: 8px; padding: 6px 9px; }
    .hp { width: 230px; }
    .hp-label { font-weight: 700; font-size: 13px; margin-bottom: 5px; }
    .hp-track { height: 10px; border-radius: 999px; background: #2a2730; overflow: hidden; }
    .hp-fill { height: 100%; width: 0%; border-radius: 999px; }
    .shop { position: absolute; right: 16px; top: 16px; width: min(360px, calc(100vw - 32px)); color: #17202a; background: rgba(246, 248, 241, .94); border: 1px solid rgba(38, 54, 68, .25); border-radius: 8px; box-shadow: 0 12px 34px rgba(25, 39, 52, .28); padding: 12px; }
    .shop[hidden], .end-screen[hidden] { display: none; }
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
    </div>
    <div class="shop" data-shop hidden></div>
    <div class="end-screen" data-end-screen hidden></div>
  </div>
`;

const shell = root.querySelector<HTMLElement>(".game-shell");
const shopEl = root.querySelector<HTMLElement>("[data-shop]");
const endScreenEl = root.querySelector<HTMLElement>("[data-end-screen]");

if (shell === null || shopEl === null || endScreenEl === null) {
  throw new Error("Missing game shell");
}

const renderer = await GameRenderer.create(shell);
const input = new InputTracker(window);
input.attach();

let stats: RunStats = createRunStats();
let latestState: InterpolatedState | undefined;
let selectedModuleId: string | undefined;
let locallyReady = false;

const connection = connect(
  resolveWsUrl(window.location, import.meta.env.VITE_WS_URL),
  (events) => {
    stats = applyEventsToStats(stats, events);
    renderer.pushEvents(events);
  }
);

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

  renderer.update(state, connection.myPlayerId, ticker.deltaMS);

  if (state.wave.phase !== "build") {
    selectedModuleId = undefined;
    locallyReady = false;
  }

  if (state.wave.phase === "combat" || state.wave.phase === "build") {
    connection.sendInput(input.nextInput());
  }

  renderHud(root, renderer.hudState(state, connection.myPlayerId, connection.status));
  renderShop(shopEl, state, connection.latestSnapshot, connection.myPlayerId, connection.sendInput);
  renderEndScreen(endScreenEl, state, stats);
});

window.addEventListener("beforeunload", () => {
  connection.close();
  renderer.destroy();
});

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
