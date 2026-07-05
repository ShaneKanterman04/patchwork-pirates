import { Assets, Rectangle, Sprite, Texture } from "pixi.js";

export interface SpriteFrameMeta {
  assetId: string;
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: { x: number; y: number };
  contentBounds: { x: number; y: number; w: number; h: number };
}

export interface SpriteAtlasManifest {
  version: 1 | 2;
  cellSize: number;
  image: string;
  frames: Record<string, SpriteFrameMeta>;
  animations?: Record<string, SpriteAnimationMeta>;
}

export interface SpriteAtlas {
  frame(key: string): SpriteFrame | undefined;
  animation(assetId: string, name: string): SpriteAnimation | undefined;
}

export interface SpriteFrame {
  meta: SpriteFrameMeta;
  texture: Texture;
}

export interface SpriteAnimationMeta {
  assetId: string;
  name: string;
  frames: string[];
  fps: number;
  loop: boolean;
  sharedBounds: { x: number; y: number; w: number; h: number };
}

export interface SpriteAnimation {
  meta: SpriteAnimationMeta;
  frames: SpriteFrame[];
}

export async function loadSpriteAtlas(basePath = "/assets/sprites"): Promise<SpriteAtlas | null> {
  try {
    const manifestResponse = await fetch(`${basePath}/spritesheet.json`, { cache: "no-cache" });
    if (!manifestResponse.ok) {
      return null;
    }

    const parsed: unknown = await manifestResponse.json();
    if (!isSpriteAtlasManifest(parsed)) {
      console.warn("Ignoring invalid sprite atlas manifest");
      return null;
    }

    const baseTexture = await Assets.load<Texture>(`${basePath}/${parsed.image}`);
    const frames = new Map<string, SpriteFrame>();
    const animations = new Map<string, SpriteAnimation>();

    for (const [key, meta] of Object.entries(parsed.frames)) {
      frames.set(key, {
        meta,
        texture: new Texture({
          source: baseTexture.source,
          frame: new Rectangle(meta.x, meta.y, meta.w, meta.h),
          defaultAnchor: meta.anchor
        })
      });
    }

    for (const [key, meta] of Object.entries(parsed.animations ?? {})) {
      const animationFrames = meta.frames
        .map((frameKey) => frames.get(frameKey))
        .filter((frame): frame is SpriteFrame => frame !== undefined);
      if (animationFrames.length === meta.frames.length) {
        animations.set(key, { meta, frames: animationFrames });
      }
    }

    return {
      frame(key: string): SpriteFrame | undefined {
        return frames.get(key);
      },
      animation(assetId: string, name: string): SpriteAnimation | undefined {
        return animations.get(`${assetId}/${name}`);
      }
    };
  } catch (error) {
    console.warn("Sprite atlas unavailable; using procedural rendering", error);
    return null;
  }
}

export function setSpriteAnimationFrame(
  sprite: Sprite,
  animation: SpriteAnimation,
  timeMs: number,
  visibleWorldSize: number
): void {
  const index = animationFrameIndex(animation, timeMs);
  const frame = animation.frames[index] ?? animation.frames[0];
  if (frame === undefined) {
    sprite.visible = false;
    return;
  }

  const contentPx = Math.max(animation.meta.sharedBounds.w, animation.meta.sharedBounds.h, 1);
  sprite.texture = frame.texture;
  sprite.anchor.set(frame.meta.anchor.x, frame.meta.anchor.y);
  sprite.scale.set(visibleWorldSize / contentPx);
  sprite.visible = true;
}

export function setSpriteFrame(sprite: Sprite, frame: SpriteFrame, visibleWorldSize: number): void {
  const contentPx = Math.max(frame.meta.contentBounds.w, frame.meta.contentBounds.h, 1);
  sprite.texture = frame.texture;
  sprite.anchor.set(frame.meta.anchor.x, frame.meta.anchor.y);
  sprite.scale.set(visibleWorldSize / contentPx);
  sprite.visible = true;
}

function animationFrameIndex(animation: SpriteAnimation, timeMs: number): number {
  if (animation.frames.length <= 1 || animation.meta.fps <= 0) {
    return 0;
  }

  const frameDurationMs = 1000 / animation.meta.fps;
  const rawIndex = Math.floor(timeMs / frameDurationMs);
  if (animation.meta.loop) {
    return rawIndex % animation.frames.length;
  }

  return Math.min(animation.frames.length - 1, rawIndex);
}

function isSpriteAtlasManifest(value: unknown): value is SpriteAtlasManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const manifest = value as Partial<SpriteAtlasManifest>;
  return (
    (manifest.version === 1 || manifest.version === 2) &&
    typeof manifest.cellSize === "number" &&
    typeof manifest.image === "string" &&
    typeof manifest.frames === "object" &&
    manifest.frames !== null
  );
}
