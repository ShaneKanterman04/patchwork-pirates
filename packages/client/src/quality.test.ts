import { describe, expect, it } from "vitest";
import { createQualityMonitor, settingsForTier } from "./quality";

describe("quality monitor", () => {
  it("drops after sustained slow frames", () => {
    const monitor = createQualityMonitor("high");
    expect(runFrames(monitor, 24, 0, 1_950)).toBe("high");
    expect(monitor.sample(24, 2_000)).toBe("medium");
  });

  it("does not drop on a brief spike", () => {
    const monitor = createQualityMonitor("high");
    runFrames(monitor, 24, 0, 1_000);
    expect(runFrames(monitor, 12, 1_050, 3_500)).toBe("high");
  });

  it("raises after sustained fast frames", () => {
    const monitor = createQualityMonitor("medium");
    expect(runFrames(monitor, 12, 0, 9_950)).toBe("medium");
    expect(monitor.sample(12, 10_000)).toBe("high");
  });

  it("uses a cooldown to prevent immediate double drops", () => {
    const monitor = createQualityMonitor("high");
    expect(runFrames(monitor, 24, 0, 2_000)).toBe("medium");
    expect(runFrames(monitor, 24, 2_050, 3_450)).toBe("medium");
    expect(runFrames(monitor, 24, 3_500, 5_450)).toBe("medium");
    expect(monitor.sample(24, 5_500)).toBe("low");
  });

  it("keeps low as the floor and high as the ceiling", () => {
    expect(runFrames(createQualityMonitor("low"), 24, 0, 5_000)).toBe("low");
    expect(runFrames(createQualityMonitor("high"), 12, 0, 12_000)).toBe("high");
  });

  it("ignores tab-switch-sized frame samples", () => {
    const monitor = createQualityMonitor("high");
    runFrames(monitor, 24, 0, 1_950);
    expect(monitor.sample(1_200, 2_000)).toBe("high");
    expect(runFrames(monitor, 24, 10_000, 11_950)).toBe("high");
    expect(monitor.sample(24, 12_000)).toBe("medium");
  });

  it("returns the tier settings table", () => {
    expect(settingsForTier("high")).toEqual({
      resolutionScale: 1,
      particleMultiplier: 1,
      enemyWakes: true,
      screenShake: true,
      enemyDeckBob: true,
      oceanAnimation: true
    });
    expect(settingsForTier("medium")).toEqual({
      resolutionScale: 0.75,
      particleMultiplier: 0.5,
      enemyWakes: false,
      screenShake: true,
      enemyDeckBob: true,
      oceanAnimation: true
    });
    expect(settingsForTier("low")).toEqual({
      resolutionScale: 0.5,
      particleMultiplier: 0,
      enemyWakes: false,
      screenShake: false,
      enemyDeckBob: false,
      oceanAnimation: false
    });
  });
});

function runFrames(
  monitor: ReturnType<typeof createQualityMonitor>,
  frameMs: number,
  startMs: number,
  endMs: number
): ReturnType<ReturnType<typeof createQualityMonitor>["sample"]> {
  let tier = monitor.sample(frameMs, startMs);
  for (let nowMs = startMs + 50; nowMs <= endMs; nowMs += 50) {
    tier = monitor.sample(frameMs, nowMs);
  }
  return tier;
}
