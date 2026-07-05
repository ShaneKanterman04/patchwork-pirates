import { describe, expect, it } from "vitest";
import { createSfxThrottleState, throttleSfx } from "./sfxThrottle";

describe("sfx throttle", () => {
  it("blocks rapid identical sounds but allows them after the interval", () => {
    const first = throttleSfx(createSfxThrottleState(), "hit", 100, 80);
    expect(first.allowed).toBe(true);

    const second = throttleSfx(first.state, "hit", 150, 80);
    expect(second.allowed).toBe(false);

    const third = throttleSfx(second.state, "hit", 181, 80);
    expect(third.allowed).toBe(true);
  });

  it("tracks sound keys independently", () => {
    const first = throttleSfx(createSfxThrottleState(), "hit", 100, 80);
    const second = throttleSfx(first.state, "coin", 120, 80);
    expect(second.allowed).toBe(true);
  });
});
