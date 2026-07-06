import { describe, expect, it } from "vitest";
import type { LobbyPlayer, PlayerView, Snapshot } from "@patchwork/protocol";
import {
  characterName,
  currentScreen,
  lobbyStatusText,
  lobbyViewModel,
  ownCanRevive,
  pingColor,
  scoreboardRows
} from "./coOpLogic";

describe("co-op client logic", () => {
  it("keeps the lobby visible before an active run starts", () => {
    const model = lobbyViewModel({
      lobbyCode: "ABCD",
      lobbyPlayers: [lobbyPlayer("p1", "captain", false)],
      canStart: false,
      myPlayerId: "p1",
      snapshot: snapshot("lobby")
    });

    expect(model.inLobby).toBe(true);
    expect(model.activeRun).toBe(false);
    expect(model.ownPlayer?.id).toBe("p1");
  });

  it("hides the lobby once combat/build/end phases are active", () => {
    const model = lobbyViewModel({
      lobbyCode: "ABCD",
      lobbyPlayers: [lobbyPlayer("p1", "captain", true)],
      canStart: true,
      myPlayerId: "p1",
      snapshot: snapshot("combat")
    });

    expect(model.inLobby).toBe(false);
    expect(model.activeRun).toBe(true);
  });

  it("derives lobby waiting copy from roster state", () => {
    expect(lobbyStatusText([], false)).toBe("Create or join a lobby.");
    expect(lobbyStatusText([lobbyPlayer("p1", null, false)], false)).toBe(
      "Waiting on character picks and ready checks."
    );
    expect(lobbyStatusText([lobbyPlayer("p1", "captain", false)], false)).toBe(
      "Waiting on ready checks."
    );
    expect(lobbyStatusText([lobbyPlayer("p1", "captain", true)], true)).toBe(
      "Starting run..."
    );
  });

  it("maps session state to the active screen", () => {
    expect(screen(undefined, undefined, false)).toBe("menu");
    expect(screen("ABCD", undefined, false)).toBe("lobbyRoom");
    expect(screen("ABCD", "lobby", false)).toBe("lobbyRoom");
    expect(screen("ABCD", "combat", false)).toBe("game");
    expect(screen("ABCD", "build", false)).toBe("game");
    expect(screen("ABCD", "victory", false)).toBe("end");
    expect(screen("ABCD", "defeat", false)).toBe("game");
    expect(screen("ABCD", "defeat", true)).toBe("end");
  });

  it("derives scoreboard rows with guarded optional co-op fields", () => {
    const rows = scoreboardRows(
      [
        player({ id: "p1", characterId: "captain", hp: 60, coins: 4 }),
        player({ id: "p2", characterId: undefined, hp: 0, downed: true, out: true })
      ],
      "p1",
      { captain: { name: "Captain" } }
    );

    expect(rows[0]).toMatchObject({
      label: "You",
      characterName: "Captain",
      hpText: "60/100",
      hpRatio: 0.6,
      coins: 4,
      damageDealt: 0,
      isOwn: true
    });
    expect(rows[1]).toMatchObject({
      label: "Teammate",
      characterName: "Unpicked",
      downed: true,
      out: true
    });
  });

  it("detects when the local active player can revive a nearby teammate", () => {
    expect(
      ownCanRevive(
        [
          player({ id: "p1", x: 1, y: 1 }),
          player({ id: "p2", x: 1.8, y: 1, hp: 0, downed: true })
        ],
        "p1"
      )
    ).toBe(true);
    expect(
      ownCanRevive(
        [
          player({ id: "p1", x: 1, y: 1, downed: true }),
          player({ id: "p2", x: 1.8, y: 1, hp: 0, downed: true })
        ],
        "p1"
      )
    ).toBe(false);
  });

  it("maps character and ping labels/colors without requiring every field", () => {
    expect(characterName("fisher", { fisher: { name: "Fisher" } })).toBe("Fisher");
    expect(characterName("unknown")).toBe("unknown");
    expect(pingColor("danger")).toBe(0xe23b3b);
    expect(pingColor("repair")).toBe(0x2f80ed);
    expect(pingColor("loot")).toBe(0xf2c14e);
    expect(pingColor(undefined)).toBe(0xffffff);
  });
});

function lobbyPlayer(id: string, characterId: string | null, ready: boolean): LobbyPlayer {
  return { id, characterId, ready };
}

function snapshot(phase: Snapshot["wave"]["phase"]): Snapshot {
  return {
    tick: 1,
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    wave: { number: 1, phase, timeLeft: 0 }
  };
}

function screen(
  lobbyCode: string | undefined,
  wavePhase: Snapshot["wave"]["phase"] | undefined,
  defeatRevealDone: boolean
): ReturnType<typeof currentScreen> {
  return currentScreen({ lobbyCode, wavePhase, defeatRevealDone });
}

function player(overrides: Partial<PlayerView>): PlayerView {
  return {
    id: "p1",
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    facingX: 1,
    facingY: 0,
    downed: false,
    weaponIds: [],
    ...overrides
  };
}
