export type ParticleBurstKind = "kill" | "explosion" | "pickup";

export interface ShakeOffset {
  dx: number;
  dy: number;
}

export interface ParticleSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  lifeMs: number;
  color: number;
  shape: "bubble" | "bone" | "coin" | "spark";
}

const SHAKE_DURATION_MS = 360;

export function shake(amplitude: number, ageMs: number): ShakeOffset {
  if (amplitude <= 0 || ageMs < 0 || ageMs >= SHAKE_DURATION_MS) {
    return { dx: 0, dy: 0 };
  }

  const t = ageMs / SHAKE_DURATION_MS;
  const envelope = (1 - t) * (1 - t);
  return {
    dx: Math.sin(ageMs * 0.061) * amplitude * envelope,
    dy: Math.cos(ageMs * 0.047) * amplitude * envelope
  };
}

export function particleBurst(
  kind: ParticleBurstKind,
  x: number,
  y: number,
  multiplier = 1
): ParticleSpec[] {
  const count = Math.round((kind === "explosion" ? 18 : kind === "kill" ? 10 : 8) * multiplier);
  if (count <= 0) {
    return [];
  }

  const baseSpeed = kind === "explosion" ? 1.8 : kind === "kill" ? 1.05 : 0.62;
  const lifeMs = kind === "explosion" ? 540 : kind === "kill" ? 430 : 360;
  const colors =
    kind === "pickup"
      ? [0xfff2a0, 0xffcf33, 0xffffff]
      : kind === "explosion"
        ? [0xffcf66, 0xffffff, 0x9be7ff]
        : [0x9be7ff, 0xffffff, 0xfff2dc, 0xffcf33];
  const shapes =
    kind === "pickup"
      ? (["spark", "coin"] as const)
      : kind === "explosion"
        ? (["bubble", "spark"] as const)
        : (["bubble", "bone", "coin"] as const);

  return Array.from({ length: count }, (_, index) => {
    const spread = (Math.PI * 2 * index) / count;
    const wobble = ((index * 37) % 11) / 10;
    const speed = baseSpeed * (0.72 + wobble * 0.36);
    return {
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed - (kind === "pickup" ? 0.25 : 0),
      radius: kind === "explosion" ? 0.045 + wobble * 0.025 : 0.035 + wobble * 0.02,
      lifeMs: lifeMs + index * 9,
      color: colors[index % colors.length]!,
      shape: shapes[index % shapes.length]!
    };
  });
}

export function popScale(ageMs: number, durationMs: number, strength: number): number {
  if (durationMs <= 0 || ageMs <= 0 || ageMs >= durationMs) {
    return 1;
  }

  const t = ageMs / durationMs;
  return 1 + Math.sin(Math.PI * t) * strength;
}
