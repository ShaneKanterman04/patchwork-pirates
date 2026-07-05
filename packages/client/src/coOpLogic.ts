import type { LobbyPlayer, PlayerView, Snapshot } from "@patchwork/protocol";

export type ActiveRunPhase = "combat" | "build" | "victory" | "defeat";

export interface LobbyViewModel {
  inLobby: boolean;
  activeRun: boolean;
  code: string | undefined;
  players: LobbyPlayer[];
  canStart: boolean;
  ownPlayer: LobbyPlayer | undefined;
  statusText: string;
}

export interface ScoreboardRow {
  id: string;
  label: string;
  characterName: string;
  hpText: string;
  hpRatio: number;
  coins: number;
  damageDealt: number;
  tilesRepaired: number;
  revives: number;
  downed: boolean;
  out: boolean;
  isOwn: boolean;
}

export type PingKind = "danger" | "repair" | "loot" | "group";
export type CharacterNameRegistry = Record<string, { name: string } | undefined>;

export function isActiveRunPhase(phase: Snapshot["wave"]["phase"] | undefined): phase is ActiveRunPhase {
  return phase === "combat" || phase === "build" || phase === "victory" || phase === "defeat";
}

export function lobbyViewModel(input: {
  lobbyCode: string | undefined;
  lobbyPlayers: readonly LobbyPlayer[];
  canStart: boolean;
  myPlayerId: string | undefined;
  snapshot: Snapshot | undefined;
}): LobbyViewModel {
  const activeRun = isActiveRunPhase(input.snapshot?.wave.phase);
  const inLobby =
    !activeRun &&
    (input.lobbyCode !== undefined ||
      input.lobbyPlayers.length > 0 ||
      input.snapshot === undefined ||
      input.snapshot.wave.phase === "lobby");
  const ownPlayer = input.lobbyPlayers.find((player) => player.id === input.myPlayerId);

  return {
    inLobby,
    activeRun,
    code: input.lobbyCode,
    players: [...input.lobbyPlayers],
    canStart: input.canStart,
    ownPlayer,
    statusText: lobbyStatusText(input.lobbyPlayers, input.canStart)
  };
}

export function lobbyStatusText(players: readonly LobbyPlayer[], canStart: boolean): string {
  if (players.length === 0) {
    return "Create or join a lobby.";
  }

  if (canStart) {
    return "Starting run...";
  }

  const missingCharacter = players.some((player) => player.characterId === null);
  const waitingReady = players.some((player) => !player.ready);

  if (missingCharacter && waitingReady) {
    return "Waiting on character picks and ready checks.";
  }

  if (missingCharacter) {
    return "Waiting on character picks.";
  }

  return "Waiting on ready checks.";
}

export function characterName(
  characterId: string | null | undefined,
  registry: CharacterNameRegistry = {}
): string {
  if (characterId === null || characterId === undefined) {
    return "Unpicked";
  }

  return registry[characterId]?.name ?? characterId;
}

export function characterColor(characterId: string | null | undefined): number {
  if (characterId === "fisher") {
    return 0x18a7b5;
  }

  if (characterId === "captain") {
    return 0xd94f3d;
  }

  return 0x20b486;
}

export function pingColor(kind: string | undefined): number {
  if (kind === "danger") {
    return 0xe23b3b;
  }

  if (kind === "repair") {
    return 0x2f80ed;
  }

  if (kind === "loot") {
    return 0xf2c14e;
  }

  return 0xffffff;
}

export function scoreboardRows(
  players: readonly PlayerView[],
  myPlayerId: string | undefined,
  registry: CharacterNameRegistry = {}
): ScoreboardRow[] {
  return players.map((player) => {
    const hpRatio = player.maxHp > 0 ? clamp01(player.hp / player.maxHp) : 0;
    const hp = Math.max(0, Math.ceil(player.hp));
    const maxHp = Math.max(0, Math.ceil(player.maxHp));

    return {
      id: player.id,
      label: player.id === myPlayerId ? "You" : "Teammate",
      characterName: characterName(player.characterId, registry),
      hpText: `${hp}/${maxHp}`,
      hpRatio,
      coins: player.coins ?? 0,
      damageDealt: player.stats?.damageDealt ?? 0,
      tilesRepaired: player.stats?.tilesRepaired ?? 0,
      revives: player.stats?.revives ?? 0,
      downed: player.downed,
      out: player.out ?? false,
      isOwn: player.id === myPlayerId
    };
  });
}

export function ownCanRevive(players: readonly PlayerView[], myPlayerId: string | undefined, range = 1.25): boolean {
  const own = players.find((player) => player.id === myPlayerId);

  if (own === undefined || own.downed || (own.out ?? false)) {
    return false;
  }

  return players.some((player) => {
    if (player.id === own.id || !player.downed || (player.out ?? false)) {
      return false;
    }

    return Math.hypot(player.x - own.x, player.y - own.y) <= range;
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
