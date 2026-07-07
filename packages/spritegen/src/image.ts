import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";

export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function readPng(path: string): Promise<RgbaImage> {
  return await new Promise((resolve, reject) => {
    createReadStream(path)
      .pipe(new PNG())
      .on("parsed", function parsed(this: PNG) {
        resolve({
          width: this.width,
          height: this.height,
          data: Buffer.from(this.data)
        });
      })
      .on("error", reject);
  });
}

export async function writePng(path: string, image: RgbaImage): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const png = new PNG({ width: image.width, height: image.height });
    image.data.copy(png.data);
    png
      .pack()
      .pipe(createWriteStream(path))
      .on("finish", resolve)
      .on("error", reject);
  });
}

export function emptyImage(width: number, height: number): RgbaImage {
  return {
    width,
    height,
    data: Buffer.alloc(width * height * 4)
  };
}

export function copyImage(source: RgbaImage): RgbaImage {
  return {
    width: source.width,
    height: source.height,
    data: Buffer.from(source.data)
  };
}

export function alphaBounds(image: RgbaImage, alphaThreshold: number): Bounds | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0;
      if (alpha <= alphaThreshold) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function removeChromaKey(source: RgbaImage, threshold: number): RgbaImage {
  const image = copyImage(source);
  const key = averageCornerColor(source);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const distance = colorDistance(
        image.data[offset] ?? 0,
        image.data[offset + 1] ?? 0,
        image.data[offset + 2] ?? 0,
        key.r,
        key.g,
        key.b
      );
      if (distance <= threshold || isGreenScreenPixel(image, offset)) {
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 0;
      }
    }
  }

  despillEdges(image);
  clearTransparentRgb(image);
  return image;
}

function despillEdges(image: RgbaImage): void {
  const alpha = Buffer.alloc(image.width * image.height);

  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = image.data[i * 4 + 3] ?? 0;
  }

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixelIndex = y * image.width + x;
      if (alpha[pixelIndex] !== 255 || !isNearTransparentPixel(alpha, image.width, image.height, x, y, 2)) {
        continue;
      }

      const offset = pixelIndex * 4;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;

      if (g > 60 && g > r * 1.4 && g > b * 1.4) {
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 0;
      } else if (g > r * 1.15 && g > b * 1.15) {
        image.data[offset + 1] = Math.max(r, b);
      }
    }
  }
}

function isNearTransparentPixel(
  alpha: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): boolean {
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(height - 1, y + radius);
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(width - 1, x + radius);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if (px === x && py === y) {
        continue;
      }
      if (alpha[py * width + px] === 0) {
        return true;
      }
    }
  }

  return false;
}

function isGreenScreenPixel(image: RgbaImage, offset: number): boolean {
  const r = image.data[offset] ?? 0;
  const g = image.data[offset + 1] ?? 0;
  const b = image.data[offset + 2] ?? 0;
  return g >= 170 && g - r >= 75 && g - b >= 65;
}

export function normalizeToCell(
  source: RgbaImage,
  bounds: Bounds,
  cellSize: number,
  targetContentPx: number,
  paddingPx: number
): { image: RgbaImage; bounds: Bounds } {
  const maxContent = Math.max(1, cellSize - paddingPx * 2);
  const target = Math.min(targetContentPx, maxContent);
  const scale = target / Math.max(bounds.w, bounds.h);
  const scaledW = Math.max(1, Math.round(bounds.w * scale));
  const scaledH = Math.max(1, Math.round(bounds.h * scale));
  const originX = Math.floor((cellSize - scaledW) / 2);
  const originY = Math.floor((cellSize - scaledH) / 2);
  const output = emptyImage(cellSize, cellSize);

  for (let y = 0; y < scaledH; y += 1) {
    for (let x = 0; x < scaledW; x += 1) {
      const srcX = bounds.x + Math.min(bounds.w - 1, Math.floor(x / scale));
      const srcY = bounds.y + Math.min(bounds.h - 1, Math.floor(y / scale));
      const srcOffset = (srcY * source.width + srcX) * 4;
      const dstOffset = ((originY + y) * cellSize + originX + x) * 4;
      output.data[dstOffset] = source.data[srcOffset] ?? 0;
      output.data[dstOffset + 1] = source.data[srcOffset + 1] ?? 0;
      output.data[dstOffset + 2] = source.data[srcOffset + 2] ?? 0;
      output.data[dstOffset + 3] = source.data[srcOffset + 3] ?? 0;
    }
  }

  return {
    image: output,
    bounds: { x: originX, y: originY, w: scaledW, h: scaledH }
  };
}

export function blit(source: RgbaImage, target: RgbaImage, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy += 1) {
    for (let sx = 0; sx < source.width; sx += 1) {
      const sourceOffset = (sy * source.width + sx) * 4;
      const targetOffset = ((y + sy) * target.width + x + sx) * 4;
      target.data[targetOffset] = source.data[sourceOffset] ?? 0;
      target.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
      target.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
      target.data[targetOffset + 3] = source.data[sourceOffset + 3] ?? 0;
    }
  }
}

function averageCornerColor(image: RgbaImage): { r: number; g: number; b: number } {
  const points = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1]
  ] as const;
  let r = 0;
  let g = 0;
  let b = 0;

  for (const [x, y] of points) {
    const offset = (y * image.width + x) * 4;
    r += image.data[offset] ?? 0;
    g += image.data[offset + 1] ?? 0;
    b += image.data[offset + 2] ?? 0;
  }

  return {
    r: Math.round(r / points.length),
    g: Math.round(g / points.length),
    b: Math.round(b / points.length)
  };
}

function colorDistance(ar: number, ag: number, ab: number, br: number, bg: number, bb: number): number {
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clearTransparentRgb(image: RgbaImage): void {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if ((image.data[offset + 3] ?? 0) === 0) {
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
    }
  }
}
