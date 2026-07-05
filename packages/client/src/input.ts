import type { ClientMessage } from "@patchwork/protocol";

const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const UP_KEYS = new Set(["KeyW", "ArrowUp"]);
const DOWN_KEYS = new Set(["KeyS", "ArrowDown"]);
const DASH_KEYS = new Set(["Space", "ShiftLeft", "ShiftRight"]);
const INTERACT_KEYS = new Set(["KeyE"]);
const PING_KEYS = new Set(["KeyQ"]);
const SCOREBOARD_KEYS = new Set(["Tab"]);
const PREVENT_DEFAULT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "Tab"
]);

type PlayerInputMessage = Extract<ClientMessage, { type: "player_input" }>;

export function keysToInput(
  held: ReadonlySet<string>,
  seq: number
): PlayerInputMessage {
  const x = axis(held, RIGHT_KEYS) - axis(held, LEFT_KEYS);
  const y = axis(held, DOWN_KEYS) - axis(held, UP_KEYS);
  const magnitude = Math.hypot(x, y);

  return {
    type: "player_input",
    seq,
    movement: magnitude > 0 ? { x: x / magnitude, y: y / magnitude } : { x: 0, y: 0 },
    dash: hasAny(held, DASH_KEYS),
    interact: hasAny(held, INTERACT_KEYS)
  };
}

export class InputTracker {
  private readonly held = new Set<string>();
  private seq = 0;
  private pendingPing = false;

  constructor(private readonly target: Window) {}

  attach(): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!this.held.has(event.code) && PING_KEYS.has(event.code)) {
        this.pendingPing = true;
      }
      this.held.add(event.code);
      preventPageScroll(event);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.held.delete(event.code);
      preventPageScroll(event);
    };

    this.target.addEventListener("keydown", onKeyDown);
    this.target.addEventListener("keyup", onKeyUp);
    this.target.addEventListener("blur", this.clear);

    return () => {
      this.target.removeEventListener("keydown", onKeyDown);
      this.target.removeEventListener("keyup", onKeyUp);
      this.target.removeEventListener("blur", this.clear);
    };
  }

  nextInput(): PlayerInputMessage {
    this.seq += 1;
    return keysToInput(this.held, this.seq);
  }

  consumePingPressed(): boolean {
    const pressed = this.pendingPing;
    this.pendingPing = false;
    return pressed;
  }

  isScoreboardHeld(): boolean {
    return hasAny(this.held, SCOREBOARD_KEYS);
  }

  private readonly clear = (): void => {
    this.held.clear();
    this.pendingPing = false;
  };
}

function axis(held: ReadonlySet<string>, keys: ReadonlySet<string>): number {
  return hasAny(held, keys) ? 1 : 0;
}

function hasAny(held: ReadonlySet<string>, keys: ReadonlySet<string>): boolean {
  for (const key of keys) {
    if (held.has(key)) {
      return true;
    }
  }

  return false;
}

function preventPageScroll(event: KeyboardEvent): void {
  if (PREVENT_DEFAULT_KEYS.has(event.code)) {
    event.preventDefault();
  }
}
