import { MVP_SPRITE_ASSETS, SIZE_CLASSES, SPRITE_CELL_SIZE, SPRITE_STYLE_GUIDE } from "./contracts";
import type { SpriteAssetSpec } from "./contracts";

export function promptForFrame(asset: SpriteAssetSpec, frameName: string): string {
  const frame = asset.frames.find((candidate) => candidate.name === frameName);
  if (frame === undefined) {
    throw new Error(`Unknown frame "${frameName}" for asset "${asset.id}"`);
  }

  const size = SIZE_CLASSES[asset.sizeClass];
  const notes = asset.notes === undefined ? "" : `\nAsset notes: ${asset.notes}`;
  const referenceLine =
    frame.optional === true
      ? "Input/reference image: use the current idle sprite for this asset as the identity, palette, outline weight, camera angle, proportions, and scale reference; change only the requested pose."
      : "";

  return [
    "Use case: stylized-concept",
    `Asset type: game sprite frame for Patchwork Pirates`,
    `Primary request: ${asset.subject}`,
    `Frame/action: ${frame.promptAction}`,
    `Style/medium: ${SPRITE_STYLE_GUIDE}`,
    `Composition/framing: one complete subject centered in a square canvas; visual mass should fit a ${size.targetContentPx}px content box inside a ${SPRITE_CELL_SIZE}x${SPRITE_CELL_SIZE} sprite cell`,
    "Scene/backdrop: perfectly flat solid #00ff00 chroma-key background only",
    referenceLine,
    "Constraints: no shadows, no gradients, no texture in the background, no floor plane, no crop, no text, no logos, no watermark, do not use #00ff00 in the subject",
    "Avoid: realistic photo rendering, thin fragile details, oversized weapon props, inconsistent camera angle",
    notes
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function allPromptFiles(): Record<string, string> {
  const files: Record<string, string> = {};

  for (const asset of MVP_SPRITE_ASSETS) {
    for (const frame of asset.frames) {
      files[`${asset.id}/${frame.name}.txt`] = promptForFrame(asset, frame.name);
    }
  }

  return files;
}
