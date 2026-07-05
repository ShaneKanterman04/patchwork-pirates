import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MVP_SPRITE_ASSETS, SIZE_CLASSES, SPRITE_CELL_SIZE } from "./contracts";
import { alphaBounds, emptyImage, readPng, writePng } from "./image";
import { buildAtlas, checkDirectory, normalizeDirectory, writePromptFiles } from "./pipeline";

describe("sprite pipeline", () => {
  it("writes stable prompts for the MVP sprite roster", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spritegen-prompts-"));
    try {
      const written = await writePromptFiles(dir);
      const prompt = await readFile(join(dir, "captain", "idle.txt"), "utf8");
      const animationPrompt = await readFile(join(dir, "captain", "walk_0.txt"), "utf8");

      expect(written.length).toBeGreaterThan(MVP_SPRITE_ASSETS.length);
      expect(prompt).toContain("Patchwork Pirates");
      expect(prompt).toContain("#00ff00");
      expect(prompt).toContain("128x128");
      expect(animationPrompt).toContain("use the current idle sprite");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps optional animation frames out of the atlas until they exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spritegen-static-pipeline-"));
    try {
      const rawDir = join(dir, "raw");
      const normalizedDir = join(dir, "normalized");
      const atlasDir = join(dir, "atlas");
      await writeSyntheticRawRoster(rawDir, false);

      await normalizeDirectory(rawDir, normalizedDir);
      const issues = await checkDirectory(normalizedDir);
      const manifest = await buildAtlas(normalizedDir, atlasDir);

      expect(issues).toEqual([]);
      expect(manifest.version).toBe(2);
      expect(Object.keys(manifest.frames).length).toBe(requiredFrameCount());
      expect(Object.keys(manifest.animations)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("normalizes, checks, and atlases a full synthetic roster", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spritegen-pipeline-"));
    try {
      const rawDir = join(dir, "raw");
      const normalizedDir = join(dir, "normalized");
      const atlasDir = join(dir, "atlas");
      await writeSyntheticRawRoster(rawDir, true);

      await normalizeDirectory(rawDir, normalizedDir);
      const issues = await checkDirectory(normalizedDir);
      const manifest = await buildAtlas(normalizedDir, atlasDir);
      const atlas = await readPng(join(atlasDir, manifest.image));
      const captain = await readPng(join(normalizedDir, "captain", "idle.png"));
      const captainBounds = alphaBounds(captain, 12);

      expect(issues).toEqual([]);
      expect(manifest.version).toBe(2);
      expect(Object.keys(manifest.frames).length).toBeGreaterThan(MVP_SPRITE_ASSETS.length);
      expect(manifest.animations["captain/idle"]?.frames).toEqual(["captain/idle", "captain/idle_1"]);
      expect(manifest.animations["captain/walk"]?.frames).toHaveLength(4);
      expect(atlas.width % SPRITE_CELL_SIZE).toBe(0);
      expect(atlas.height % SPRITE_CELL_SIZE).toBe(0);
      expect(captainBounds).not.toBeNull();
      expect(Math.max(captainBounds!.w, captainBounds!.h)).toBe(SIZE_CLASSES.medium.targetContentPx);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports animation center drift for existing animation frames", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spritegen-drift-"));
    try {
      const normalizedDir = join(dir, "normalized");
      await writeSyntheticNormalizedRoster(normalizedDir);
      await writeFrame(join(normalizedDir, "captain", "idle_1.png"), SIZE_CLASSES.medium.targetContentPx, 8);

      const issues = await checkDirectory(normalizedDir);

      expect(issues.some((issue) => issue.path === "captain/idle" && issue.message.includes("center drift"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeSyntheticRawRoster(rawDir: string, includeOptional: boolean): Promise<void> {
  for (const asset of MVP_SPRITE_ASSETS) {
    const size = SIZE_CLASSES[asset.sizeClass].targetContentPx;
    for (const frame of asset.frames) {
      if (frame.optional === true && !includeOptional) {
        continue;
      }
      const image = emptyImage(160, 160);
      fill(image, 0, 255, 0, 255);
      const rawSize = Math.max(12, Math.round(size * 1.2));
      rect(
        image,
        Math.floor((image.width - rawSize) / 2),
        Math.floor((image.height - rawSize) / 2),
        rawSize,
        rawSize,
        30 + (asset.id.length * 17) % 180,
        70,
        120,
        255
      );
      await writePng(join(rawDir, asset.id, `${frame.name}.png`), image);
    }
  }
}

async function writeSyntheticNormalizedRoster(normalizedDir: string): Promise<void> {
  for (const asset of MVP_SPRITE_ASSETS) {
    const size = SIZE_CLASSES[asset.sizeClass].targetContentPx;
    for (const frame of asset.frames) {
      if (frame.optional === true) {
        continue;
      }
      await writeFrame(join(normalizedDir, asset.id, `${frame.name}.png`), size, 0);
    }
  }
}

async function writeFrame(path: string, size: number, offsetX: number): Promise<void> {
  const image = emptyImage(SPRITE_CELL_SIZE, SPRITE_CELL_SIZE);
  const x = Math.floor((SPRITE_CELL_SIZE - size) / 2) + offsetX;
  const y = Math.floor((SPRITE_CELL_SIZE - size) / 2);
  rect(image, x, y, size, size, 90, 70, 120, 255);
  await writePng(path, image);
}

function fill(image: { width: number; height: number; data: Buffer }, r: number, g: number, b: number, a: number): void {
  rect(image, 0, 0, image.width, image.height, r, g, b, a);
}

function rect(
  image: { width: number; height: number; data: Buffer },
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const offset = (py * image.width + px) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = a;
    }
  }
}

function requiredFrameCount(): number {
  return MVP_SPRITE_ASSETS.reduce(
    (count, asset) => count + asset.frames.filter((frame) => frame.optional !== true).length,
    0
  );
}
