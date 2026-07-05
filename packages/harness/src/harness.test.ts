import { describe, expect, it } from "vitest";
import { BOTS } from "./bots";
import { dpsProbe, runOne } from "./harness";

describe("balance harness", () => {
  it("runs a deterministic seeded simulation", () => {
    const first = runOne({
      seed: 1234,
      characterId: "captain",
      extraWeapons: ["cutlass", "cutlass", "cutlass", "cutlass"],
      bot: BOTS.standAndFight
    });
    const second = runOne({
      seed: 1234,
      characterId: "captain",
      extraWeapons: ["cutlass", "cutlass", "cutlass", "cutlass"],
      bot: BOTS.standAndFight
    });

    expect(second).toEqual(first);
    expect(first.waveReached).toBeGreaterThanOrEqual(1);
    expect(first.coreHpByWave.length).toBeGreaterThanOrEqual(1);
  });

  it("probes weapon DPS", () => {
    expect(dpsProbe("cutlass")).toBeGreaterThan(0);
  });
});
