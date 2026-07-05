import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  DEFAULT_NORMALIZE_OPTIONS,
  MVP_SPRITE_ASSETS,
  SIZE_CLASSES,
  SPRITE_CELL_SIZE,
  frameKey
} from "./contracts";
import type {
  SpriteAnimationMeta,
  SpriteAssetSpec,
  SpriteAtlasManifest,
  SpriteFrameMeta
} from "./contracts";
import { allPromptFiles } from "./prompts";
import { alphaBounds, blit, emptyImage, normalizeToCell, readPng, removeChromaKey, writePng } from "./image";
import type { Bounds, RgbaImage } from "./image";

export interface NormalizeResult {
  sourcePath: string;
  outputPath: string;
  asset: SpriteAssetSpec;
  frame: string;
  bounds: Bounds;
}

export interface CheckIssue {
  path: string;
  message: string;
}

export async function writePromptFiles(outDir: string): Promise<string[]> {
  const files = allPromptFiles();
  const written: string[] = [];

  for (const [name, prompt] of Object.entries(files)) {
    const path = join(outDir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${prompt}\n`, "utf8");
    written.push(path);
  }

  return written;
}

export async function normalizeDirectory(rawDir: string, outDir: string): Promise<NormalizeResult[]> {
  const results: NormalizeResult[] = [];

  for (const asset of MVP_SPRITE_ASSETS) {
    for (const frame of asset.frames) {
      const sourcePath = join(rawDir, asset.id, `${frame.name}.png`);
      const outputPath = join(outDir, asset.id, `${frame.name}.png`);
      const sourceExists = await fileExists(sourcePath);
      if (!sourceExists && frame.optional === true) {
        continue;
      }
      if (!sourceExists) {
        throw new Error(`Missing required sprite source: ${sourcePath}`);
      }

      const image = await readPng(sourcePath);
      const keyed = removeChromaKey(image, DEFAULT_NORMALIZE_OPTIONS.chromaThreshold);
      const sourceBounds = alphaBounds(keyed, DEFAULT_NORMALIZE_OPTIONS.alphaThreshold);
      if (sourceBounds === null) {
        throw new Error(`No visible pixels found in ${sourcePath}`);
      }

      const size = SIZE_CLASSES[asset.sizeClass];
      const normalized = normalizeToCell(
        keyed,
        sourceBounds,
        SPRITE_CELL_SIZE,
        size.targetContentPx,
        DEFAULT_NORMALIZE_OPTIONS.paddingPx
      );

      await writePng(outputPath, normalized.image);
      results.push({
        sourcePath,
        outputPath,
        asset,
        frame: frame.name,
        bounds: normalized.bounds
      });
    }
  }

  await stabilizeAnimationFrames(outDir, results);
  return results;
}

export async function checkDirectory(normalizedDir: string): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const boundsByFrame = new Map<string, Bounds>();

  for (const asset of MVP_SPRITE_ASSETS) {
    const size = SIZE_CLASSES[asset.sizeClass];
    for (const frame of asset.frames) {
      const path = join(normalizedDir, asset.id, `${frame.name}.png`);
      const exists = await fileExists(path);
      if (!exists && frame.optional === true) {
        continue;
      }
      if (!exists) {
        issues.push({ path, message: "missing required PNG" });
        continue;
      }

      let image: RgbaImage;
      try {
        image = await readPng(path);
      } catch (error) {
        issues.push({ path, message: `missing or unreadable PNG: ${errorMessage(error)}` });
        continue;
      }

      if (image.width !== SPRITE_CELL_SIZE || image.height !== SPRITE_CELL_SIZE) {
        issues.push({ path, message: `must be ${SPRITE_CELL_SIZE}x${SPRITE_CELL_SIZE}, got ${image.width}x${image.height}` });
        continue;
      }

      const bounds = alphaBounds(image, DEFAULT_NORMALIZE_OPTIONS.alphaThreshold);
      if (bounds === null) {
        issues.push({ path, message: "frame is blank" });
        continue;
      }
      boundsByFrame.set(frameKey(asset.id, frame.name), bounds);

      const contentPx = Math.max(bounds.w, bounds.h);
      const drift = Math.abs(contentPx - size.targetContentPx);
      if (drift > size.tolerancePx) {
        issues.push({
          path,
          message: `content size ${contentPx}px is outside ${asset.sizeClass} target ${size.targetContentPx}px +/- ${size.tolerancePx}px`
        });
      }

      const minMargin = Math.min(bounds.x, bounds.y, SPRITE_CELL_SIZE - bounds.x - bounds.w, SPRITE_CELL_SIZE - bounds.y - bounds.h);
      if (minMargin < DEFAULT_NORMALIZE_OPTIONS.paddingPx) {
        issues.push({ path, message: `content margin ${minMargin}px is below ${DEFAULT_NORMALIZE_OPTIONS.paddingPx}px` });
      }
    }

    for (const animation of asset.animations ?? []) {
      const keys = animation.frames.map((frameName) => frameKey(asset.id, frameName));
      const bounds = keys.map((key) => boundsByFrame.get(key));
      if (bounds.some((candidate) => candidate === undefined)) {
        continue;
      }

      const first = bounds[0]!;
      for (let index = 1; index < bounds.length; index += 1) {
        const current = bounds[index]!;
        const centerDrift = Math.hypot(centerX(current) - centerX(first), centerY(current) - centerY(first));
        const sizeDrift = Math.max(Math.abs(current.w - first.w), Math.abs(current.h - first.h));
        if (centerDrift > 4) {
          issues.push({
            path: `${asset.id}/${animation.name}`,
            message: `animation center drift ${centerDrift.toFixed(1)}px exceeds 4px`
          });
        }
        if (sizeDrift > 6) {
          issues.push({
            path: `${asset.id}/${animation.name}`,
            message: `animation bounds drift ${sizeDrift}px exceeds 6px`
          });
        }
      }
    }
  }

  return issues;
}

export async function buildAtlas(normalizedDir: string, outDir: string): Promise<SpriteAtlasManifest> {
  const frames = await collectExistingFrameSpecs(normalizedDir);
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const atlas = emptyImage(columns * SPRITE_CELL_SIZE, rows * SPRITE_CELL_SIZE);
  const manifestFrames: Record<string, SpriteFrameMeta> = {};

  for (let index = 0; index < frames.length; index += 1) {
    const item = frames[index]!;
    const x = (index % columns) * SPRITE_CELL_SIZE;
    const y = Math.floor(index / columns) * SPRITE_CELL_SIZE;
    const source = join(normalizedDir, item.asset.id, `${item.frame}.png`);
    const image = await readPng(source);
    if (image.width !== SPRITE_CELL_SIZE || image.height !== SPRITE_CELL_SIZE) {
      throw new Error(`${source} must be ${SPRITE_CELL_SIZE}x${SPRITE_CELL_SIZE}`);
    }
    blit(image, atlas, x, y);
    const bounds = alphaBounds(image, DEFAULT_NORMALIZE_OPTIONS.alphaThreshold) ?? {
      x: 0,
      y: 0,
      w: 0,
      h: 0
    };
    manifestFrames[frameKey(item.asset.id, item.frame)] = {
      assetId: item.asset.id,
      frame: item.frame,
      source: relative(outDir, source),
      x,
      y,
      w: SPRITE_CELL_SIZE,
      h: SPRITE_CELL_SIZE,
      anchor: { x: 0.5, y: 0.5 },
      sizeClass: item.asset.sizeClass,
      contentBounds: bounds
    };
  }

  const manifest: SpriteAtlasManifest = {
    version: 2,
    cellSize: SPRITE_CELL_SIZE,
    image: "spritesheet.png",
    frames: manifestFrames,
    animations: buildAnimationManifest(manifestFrames)
  };

  await writePng(join(outDir, manifest.image), atlas);
  await writeFile(join(outDir, "spritesheet.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function buildContactSheet(normalizedDir: string, outPath: string): Promise<void> {
  const frames = await collectExistingFrameSpecs(normalizedDir);
  const columns = 4;
  const labelH = 28;
  const animationRows = completeAnimationsFromFrames(new Set(frames.map((item) => frameKey(item.asset.id, item.frame)))).length;
  const rows = Math.ceil(frames.length / columns) + animationRows;
  const width = columns * SPRITE_CELL_SIZE;
  const height = rows * (SPRITE_CELL_SIZE + labelH);
  const sheet = emptyImage(width, height);
  fill(sheet, 28, 36, 48, 255);

  for (let index = 0; index < frames.length; index += 1) {
    const item = frames[index]!;
    const cellX = (index % columns) * SPRITE_CELL_SIZE;
    const cellY = Math.floor(index / columns) * (SPRITE_CELL_SIZE + labelH);
    const path = join(normalizedDir, item.asset.id, `${item.frame}.png`);
    const image = await readPng(path);
    drawChecker(sheet, cellX, cellY, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE);
    blit(image, sheet, cellX, cellY);
    drawBorder(sheet, cellX, cellY, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, 255, 255, 255, 180);
    drawTinyLabel(sheet, cellX + 4, cellY + SPRITE_CELL_SIZE + 8, `${item.asset.id}/${item.frame}`);
  }

  const stripStartY = Math.ceil(frames.length / columns) * (SPRITE_CELL_SIZE + labelH);
  const animations = completeAnimationsFromFrames(new Set(frames.map((item) => frameKey(item.asset.id, item.frame))));
  for (let index = 0; index < animations.length; index += 1) {
    const animation = animations[index]!;
    const cellY = stripStartY + index * (SPRITE_CELL_SIZE + labelH);
    drawTinyLabel(sheet, 4, cellY + 8, `${animation.asset.id}/${animation.animation.name}`);
    for (let frameIndex = 0; frameIndex < Math.min(animation.animation.frames.length, columns); frameIndex += 1) {
      const frameName = animation.animation.frames[frameIndex]!;
      const path = join(normalizedDir, animation.asset.id, `${frameName}.png`);
      const image = await readPng(path);
      const cellX = frameIndex * SPRITE_CELL_SIZE;
      drawChecker(sheet, cellX, cellY, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE);
      blit(image, sheet, cellX, cellY);
      drawBorder(sheet, cellX, cellY, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, 255, 220, 120, 220);
    }
  }

  await writePng(outPath, sheet);
}

export async function readManifest(path: string): Promise<SpriteAtlasManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isManifest(parsed)) {
    throw new Error(`${path} is not a sprite atlas manifest`);
  }
  return parsed;
}

function isManifest(value: unknown): value is SpriteAtlasManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 2 &&
    typeof (value as { cellSize?: unknown }).cellSize === "number" &&
    typeof (value as { image?: unknown }).image === "string" &&
    typeof (value as { frames?: unknown }).frames === "object" &&
    (value as { frames?: unknown }).frames !== null
  );
}

async function collectExistingFrameSpecs(normalizedDir: string): Promise<{ asset: SpriteAssetSpec; frame: string }[]> {
  const frames: { asset: SpriteAssetSpec; frame: string }[] = [];

  for (const asset of MVP_SPRITE_ASSETS) {
    for (const frame of asset.frames) {
      const path = join(normalizedDir, asset.id, `${frame.name}.png`);
      if (await fileExists(path)) {
        frames.push({ asset, frame: frame.name });
      }
    }
  }

  return frames;
}

function buildAnimationManifest(frames: Record<string, SpriteFrameMeta>): Record<string, SpriteAnimationMeta> {
  const animations: Record<string, SpriteAnimationMeta> = {};

  for (const { asset, animation } of completeAnimationsFromFrames(new Set(Object.keys(frames)))) {
    const keys = animation.frames.map((frame) => frameKey(asset.id, frame));
    const bounds = keys.map((key) => frames[key]!.contentBounds);
    animations[animationKey(asset.id, animation.name)] = {
      assetId: asset.id,
      name: animation.name,
      frames: keys,
      fps: animation.fps,
      loop: animation.loop,
      sharedBounds: unionBounds(bounds)
    };
  }

  return animations;
}

function completeAnimationsFromFrames(frameKeys: ReadonlySet<string>): {
  asset: SpriteAssetSpec;
  animation: NonNullable<SpriteAssetSpec["animations"]>[number];
}[] {
  const animations: {
    asset: SpriteAssetSpec;
    animation: NonNullable<SpriteAssetSpec["animations"]>[number];
  }[] = [];

  for (const asset of MVP_SPRITE_ASSETS) {
    for (const animation of asset.animations ?? []) {
      if (animation.frames.every((frame) => frameKeys.has(frameKey(asset.id, frame)))) {
        animations.push({ asset, animation });
      }
    }
  }

  return animations;
}

function animationKey(assetId: string, animationName: string): string {
  return `${assetId}/${animationName}`;
}

function unionBounds(bounds: readonly Bounds[]): Bounds {
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.w));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function centerX(bounds: Bounds): number {
  return bounds.x + bounds.w / 2;
}

function centerY(bounds: Bounds): number {
  return bounds.y + bounds.h / 2;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function stabilizeAnimationFrames(normalizedDir: string, results: NormalizeResult[]): Promise<void> {
  const resultsByKey = new Map(results.map((result) => [frameKey(result.asset.id, result.frame), result]));

  for (const asset of MVP_SPRITE_ASSETS) {
    for (const animation of asset.animations ?? []) {
      const items = animation.frames.map((frameName) => resultsByKey.get(frameKey(asset.id, frameName)));
      if (items.some((item) => item === undefined)) {
        continue;
      }

      const loaded = await Promise.all(
        items.map(async (item) => {
          const image = await readPng(item!.outputPath);
          const bounds = alphaBounds(image, DEFAULT_NORMALIZE_OPTIONS.alphaThreshold);
          if (bounds === null) {
            throw new Error(`No visible pixels found in ${item!.outputPath}`);
          }
          return { item: item!, image, bounds };
        })
      );

      const commonBounds = commonAnimationBounds(loaded.map((item) => item.bounds));
      for (const frame of loaded) {
        const stabilized = resampleBounds(frame.image, frame.bounds, commonBounds);
        await writePng(frame.item.outputPath, stabilized);
        frame.item.bounds = commonBounds;
      }
    }
  }
}

function commonAnimationBounds(bounds: Bounds[]): Bounds {
  const w = Math.max(...bounds.map((item) => item.w));
  const h = Math.max(...bounds.map((item) => item.h));
  const center = bounds.reduce(
    (acc, item) => ({
      x: acc.x + centerX(item),
      y: acc.y + centerY(item)
    }),
    { x: 0, y: 0 }
  );
  const centerXValue = center.x / bounds.length;
  const centerYValue = center.y / bounds.length;

  return {
    x: clamp(Math.round(centerXValue - w / 2), DEFAULT_NORMALIZE_OPTIONS.paddingPx, SPRITE_CELL_SIZE - DEFAULT_NORMALIZE_OPTIONS.paddingPx - w),
    y: clamp(Math.round(centerYValue - h / 2), DEFAULT_NORMALIZE_OPTIONS.paddingPx, SPRITE_CELL_SIZE - DEFAULT_NORMALIZE_OPTIONS.paddingPx - h),
    w,
    h
  };
}

function resampleBounds(source: RgbaImage, sourceBounds: Bounds, targetBounds: Bounds): RgbaImage {
  const output = emptyImage(source.width, source.height);

  for (let y = 0; y < targetBounds.h; y += 1) {
    for (let x = 0; x < targetBounds.w; x += 1) {
      const srcX = sourceBounds.x + Math.min(sourceBounds.w - 1, Math.floor((x / targetBounds.w) * sourceBounds.w));
      const srcY = sourceBounds.y + Math.min(sourceBounds.h - 1, Math.floor((y / targetBounds.h) * sourceBounds.h));
      const sourceOffset = (srcY * source.width + srcX) * 4;
      const targetOffset = ((targetBounds.y + y) * output.width + targetBounds.x + x) * 4;
      output.data[targetOffset] = source.data[sourceOffset] ?? 0;
      output.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
      output.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
      output.data[targetOffset + 3] = source.data[sourceOffset + 3] ?? 0;
    }
  }

  return output;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fill(image: RgbaImage, r: number, g: number, b: number, a: number): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      setPixel(image, x, y, r, g, b, a);
    }
  }
}

function drawChecker(image: RgbaImage, x: number, y: number, w: number, h: number): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const light = (Math.floor((px - x) / 8) + Math.floor((py - y) / 8)) % 2 === 0;
      setPixel(image, px, py, light ? 210 : 170, light ? 218 : 178, light ? 225 : 185, 255);
    }
  }
}

function drawBorder(image: RgbaImage, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void {
  for (let px = x; px < x + w; px += 1) {
    setPixel(image, px, y, r, g, b, a);
    setPixel(image, px, y + h - 1, r, g, b, a);
  }
  for (let py = y; py < y + h; py += 1) {
    setPixel(image, x, py, r, g, b, a);
    setPixel(image, x + w - 1, py, r, g, b, a);
  }
}

function drawTinyLabel(image: RgbaImage, x: number, y: number, text: string): void {
  for (let index = 0; index < Math.min(text.length, 28); index += 1) {
    const code = text.charCodeAt(index);
    drawByteGlyph(image, x + index * 4, y, code);
  }
}

function drawByteGlyph(image: RgbaImage, x: number, y: number, code: number): void {
  for (let bit = 0; bit < 8; bit += 1) {
    if (((code >> bit) & 1) === 0) {
      continue;
    }
    setPixel(image, x + (bit % 4), y + Math.floor(bit / 4), 235, 242, 250, 255);
    setPixel(image, x + (bit % 4), y + Math.floor(bit / 4) + 3, 235, 242, 250, 255);
  }
}

function setPixel(image: RgbaImage, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return;
  }
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
