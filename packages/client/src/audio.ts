import type { WireEvent } from "@patchwork/protocol";
import { createSfxThrottleState, throttleSfx } from "./sfxThrottle";
import type { SfxThrottleState } from "./sfxThrottle";

export type SfxKind =
  | "hit"
  | "kill"
  | "coin"
  | "repair"
  | "build"
  | "wave"
  | "downed"
  | "boss"
  | "scream"
  | "trap";

const MIN_INTERVAL_MS: Record<SfxKind, number> = {
  hit: 70,
  kill: 95,
  coin: 65,
  repair: 130,
  build: 130,
  wave: 600,
  downed: 400,
  boss: 500,
  scream: 200,
  trap: 150
};

export class ProceduralAudio {
  private context: AudioContext | undefined;
  private throttle: SfxThrottleState = createSfxThrottleState();

  constructor(
    private muted = false,
    private readonly nowMs: () => number = () => performance.now()
  ) {}

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  bindUnlock(target: Window): void {
    const unlock = (): void => {
      void this.ensureContext()?.resume();
    };
    target.addEventListener("pointerdown", unlock, { passive: true });
    target.addEventListener("keydown", unlock);
  }

  playEvent(event: WireEvent): void {
    if (event.type === "enemy_hit") {
      this.play("hit");
    } else if (event.type === "enemy_killed" || event.type === "explosion") {
      this.play("kill");
    } else if (event.type === "tile_repaired") {
      this.play("repair");
    } else if (event.type === "tile_built") {
      this.play("build");
    } else if (event.type === "trap_triggered") {
      this.play("trap");
    } else if (event.type === "enemy_screamed") {
      this.play("scream");
    }
  }

  play(kind: SfxKind): void {
    if (this.muted) {
      return;
    }

    const result = throttleSfx(this.throttle, kind, this.nowMs(), MIN_INTERVAL_MS[kind]);
    this.throttle = result.state;
    if (!result.allowed) {
      return;
    }

    const context = this.ensureContext();
    if (context === undefined || context.state !== "running") {
      return;
    }

    if (kind === "coin") {
      this.tone(880, 0.05, "sine", 0.028, 0);
      this.tone(1320, 0.08, "triangle", 0.02, 0.035);
    } else if (kind === "hit") {
      this.tone(220, 0.055, "triangle", 0.025, 0);
      this.noise(0.035, 0.012, 700);
    } else if (kind === "kill") {
      this.tone(330, 0.08, "sine", 0.026, 0);
      this.tone(520, 0.12, "triangle", 0.022, 0.04);
      this.noise(0.07, 0.014, 950);
    } else if (kind === "repair") {
      this.tone(520, 0.07, "triangle", 0.018, 0);
      this.tone(660, 0.09, "sine", 0.017, 0.055);
    } else if (kind === "build") {
      this.tone(360, 0.055, "triangle", 0.014, 0);
      this.tone(540, 0.08, "sine", 0.012, 0.04);
      this.noise(0.045, 0.007, 620);
    } else if (kind === "trap") {
      this.tone(880, 0.03, "square", 0.012, 0);
      this.tone(180, 0.06, "triangle", 0.017, 0.025);
    } else if (kind === "scream") {
      this.tone(300, 0.085, "sawtooth", 0.01, 0);
      this.tone(700, 0.105, "sawtooth", 0.008, 0.075);
      this.noise(0.055, 0.0045, 1800);
    } else if (kind === "wave") {
      this.tone(392, 0.1, "sine", 0.02, 0);
      this.tone(523, 0.14, "triangle", 0.022, 0.08);
    } else if (kind === "downed") {
      this.tone(220, 0.16, "sine", 0.018, 0);
      this.tone(165, 0.18, "triangle", 0.014, 0.09);
    } else {
      this.tone(98, 0.18, "sawtooth", 0.015, 0);
      this.tone(196, 0.22, "triangle", 0.018, 0.08);
      this.noise(0.12, 0.012, 360);
    }
  }

  private ensureContext(): AudioContext | undefined {
    if (this.context !== undefined) {
      return this.context;
    }

    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (AudioContextCtor === undefined) {
      return undefined;
    }

    this.context = new AudioContextCtor();
    return this.context;
  }

  private tone(
    frequency: number,
    seconds: number,
    type: OscillatorType,
    volume: number,
    delaySeconds: number
  ): void {
    const context = this.context;
    if (context === undefined) {
      return;
    }

    const start = context.currentTime + delaySeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  private noise(seconds: number, volume: number, lowpassHz: number): void {
    const context = this.context;
    if (context === undefined) {
      return;
    }

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = lowpassHz;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + seconds);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
