import { INTERP_DELAY_MS, interpolate } from "./interp";
import { InputTracker } from "./input";
import { connect, resolveWsUrl } from "./net";
import { GameRenderer, renderHud } from "./render";

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <div class="game-shell">
    <div class="hud" aria-live="polite">
      <div class="hud-row">
        <span class="status" data-status>connecting...</span>
        <span class="wave" data-wave>Wave 1</span>
      </div>
      <div class="hp">
        <div class="hp-label" data-hp-text>HP --</div>
        <div class="hp-track"><div class="hp-fill" data-hp-fill></div></div>
      </div>
    </div>
  </div>
`;

const shell = root.querySelector<HTMLElement>(".game-shell");

if (shell === null) {
  throw new Error("Missing game shell");
}

const renderer = await GameRenderer.create(shell);
const input = new InputTracker(window);
input.attach();

const connection = connect(
  resolveWsUrl(window.location, import.meta.env.VITE_WS_URL),
  (events) => {
    renderer.pushEvents(events);
  }
);

renderer.app.ticker.add((ticker) => {
  const renderTimeMs = performance.now() - INTERP_DELAY_MS;
  const state = interpolate(connection.snapshots, renderTimeMs);
  renderer.update(state, connection.myPlayerId, ticker.deltaMS);
  connection.sendInput(input.nextInput());
  renderHud(
    root,
    renderer.hudState(
      state,
      connection.myPlayerId,
      connection.status,
      connection.latestSnapshot?.wave.number
    )
  );
});

window.addEventListener("beforeunload", () => {
  connection.close();
  renderer.destroy();
});
