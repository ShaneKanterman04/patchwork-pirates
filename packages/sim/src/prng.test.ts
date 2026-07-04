import { describe, expect, it } from "vitest";

import { mulberry32 } from "./index";

describe("mulberry32", () => {
  it("returns the same sequence for the same seed", () => {
    const first = mulberry32(12345);
    const second = mulberry32(12345);

    expect([first(), first(), first(), first()]).toEqual([
      second(),
      second(),
      second(),
      second()
    ]);
  });

  it("produces values in [0, 1)", () => {
    const random = mulberry32(98765);

    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
