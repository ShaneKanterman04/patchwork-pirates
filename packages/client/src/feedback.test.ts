import { describe, expect, it } from "vitest";
import { particleBurst, popScale, shake } from "./feedback";

describe("feedback helpers", () => {
  it("decays shake to zero after the short shake window", () => {
    expect(shake(0.12, 0).dy).toBeCloseTo(0.12);
    expect(shake(0.12, 180).dx).not.toBe(0);
    expect(shake(0.12, 360)).toEqual({ dx: 0, dy: 0 });
    expect(shake(0.12, 800)).toEqual({ dx: 0, dy: 0 });
  });

  it("uses small deterministic particle budgets", () => {
    expect(particleBurst("kill", 1, 2)).toHaveLength(10);
    expect(particleBurst("explosion", 1, 2)).toHaveLength(18);
    expect(particleBurst("pickup", 1, 2)).toHaveLength(8);
    expect(particleBurst("kill", 1, 2)[0]).toMatchObject({ x: 1, y: 2 });
  });

  it("returns a brief scale pop and settles back to normal", () => {
    expect(popScale(0, 180, 0.18)).toBe(1);
    expect(popScale(90, 180, 0.18)).toBeCloseTo(1.18);
    expect(popScale(180, 180, 0.18)).toBe(1);
  });
});
