import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SPRITE_CELL_SIZE } from "./contracts";
import { alphaBounds, emptyImage, normalizeToCell, readPng, removeChromaKey, writePng } from "./image";

describe("sprite image helpers", () => {
  it("removes a flat chroma-key background and finds visible bounds", () => {
    const image = emptyImage(16, 16);
    fill(image, 0, 255, 0, 255);
    rect(image, 5, 6, 4, 3, 220, 40, 60, 255);

    const keyed = removeChromaKey(image, 8);
    const bounds = alphaBounds(keyed, 12);

    expect(bounds).toEqual({ x: 5, y: 6, w: 4, h: 3 });
    expect(keyed.data[3]).toBe(0);
  });

  it("despills green edge fringe after removing chroma key", () => {
    const image = emptyImage(8, 8);
    fill(image, 0, 255, 0, 255);
    rect(image, 3, 3, 3, 3, 130, 70, 90, 255);
    pixel(image, 2, 3, 3, 169, 3, 255);
    pixel(image, 3, 2, 84, 110, 70, 255);

    const keyed = removeChromaKey(image, 8);

    expect(getPixel(keyed, 2, 3)).toEqual([0, 0, 0, 0]);
    expect(getPixel(keyed, 3, 2)).toEqual([84, 84, 70, 255]);
    expect(getPixel(keyed, 3, 3)).toEqual([130, 70, 90, 255]);
  });

  it("leaves interior green pixels untouched away from transparent edges", () => {
    const image = emptyImage(10, 10);
    fill(image, 0, 255, 0, 255);
    rect(image, 2, 2, 6, 6, 120, 80, 60, 255);
    pixel(image, 5, 5, 20, 140, 30, 255);

    const keyed = removeChromaKey(image, 8);

    expect(getPixel(keyed, 5, 5)).toEqual([20, 140, 30, 255]);
  });

  it("normalizes visible content into a centered fixed-size cell", () => {
    const image = emptyImage(20, 20);
    rect(image, 4, 7, 10, 5, 120, 80, 40, 255);
    const bounds = alphaBounds(image, 12);

    expect(bounds).not.toBeNull();
    const result = normalizeToCell(image, bounds!, SPRITE_CELL_SIZE, 64, 6);

    expect(result.image.width).toBe(SPRITE_CELL_SIZE);
    expect(result.image.height).toBe(SPRITE_CELL_SIZE);
    expect(result.bounds.w).toBe(64);
    expect(result.bounds.h).toBe(32);
    expect(result.bounds.x).toBe(32);
    expect(result.bounds.y).toBe(48);
  });

  it("round-trips PNG files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spritegen-"));
    try {
      const path = join(dir, "sample.png");
      const image = emptyImage(8, 8);
      rect(image, 2, 2, 2, 2, 1, 2, 3, 255);

      await writePng(path, image);
      const loaded = await readPng(path);

      expect(loaded.width).toBe(8);
      expect(loaded.height).toBe(8);
      expect(alphaBounds(loaded, 12)).toEqual({ x: 2, y: 2, w: 2, h: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

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

function pixel(
  image: { width: number; height: number; data: Buffer },
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

function getPixel(image: { width: number; data: Buffer }, x: number, y: number): [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
    image.data[offset + 3] ?? 0
  ];
}
