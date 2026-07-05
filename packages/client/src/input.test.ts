import { describe, expect, it } from "vitest";
import { keysToInput } from "./input";

describe("keysToInput", () => {
  it("normalizes diagonal movement", () => {
    const input = keysToInput(new Set(["KeyW", "KeyD"]), 7);

    expect(input.seq).toBe(7);
    expect(input.movement.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.movement.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("cancels opposite keys", () => {
    const input = keysToInput(new Set(["KeyW", "KeyS", "ArrowLeft", "ArrowRight"]), 1);

    expect(input.movement).toEqual({ x: 0, y: 0 });
  });

  it("reports held dash and interact state", () => {
    const input = keysToInput(new Set(["Space", "KeyE"]), 3);

    expect(input.dash).toBe(true);
    expect(input.interact).toBe(true);
  });
});
