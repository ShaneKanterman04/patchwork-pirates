export const SPRITE_CELL_SIZE = 128;

export type SpriteCategory =
  | "player"
  | "enemy"
  | "module"
  | "pickup"
  | "projectile"
  | "weapon"
  | "raft";

export type SpriteSizeClass =
  | "pickup"
  | "projectile"
  | "small"
  | "medium"
  | "module"
  | "large"
  | "boss";

export interface SpriteFrameSpec {
  name: string;
  promptAction: string;
  optional?: boolean;
}

export interface SpriteAnimationSpec {
  name: string;
  frames: readonly string[];
  fps: number;
  loop: boolean;
}

export interface SpriteAssetSpec {
  id: string;
  category: SpriteCategory;
  sizeClass: SpriteSizeClass;
  subject: string;
  notes?: string;
  frames: readonly SpriteFrameSpec[];
  animations?: readonly SpriteAnimationSpec[];
}

export interface SpriteFrameMeta {
  assetId: string;
  frame: string;
  source: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: { x: number; y: number };
  sizeClass: SpriteSizeClass;
  contentBounds: { x: number; y: number; w: number; h: number };
}

export interface SpriteAtlasManifest {
  version: 2;
  cellSize: number;
  image: string;
  frames: Record<string, SpriteFrameMeta>;
  animations: Record<string, SpriteAnimationMeta>;
}

export interface SpriteAnimationMeta {
  assetId: string;
  name: string;
  frames: string[];
  fps: number;
  loop: boolean;
  sharedBounds: { x: number; y: number; w: number; h: number };
}

export interface NormalizeOptions {
  cellSize: number;
  targetContentPx: number;
  paddingPx: number;
  alphaThreshold: number;
  chromaThreshold: number;
}

export const SIZE_CLASSES: Record<SpriteSizeClass, { targetContentPx: number; tolerancePx: number }> = {
  pickup: { targetContentPx: 32, tolerancePx: 5 },
  projectile: { targetContentPx: 32, tolerancePx: 5 },
  small: { targetContentPx: 64, tolerancePx: 7 },
  medium: { targetContentPx: 82, tolerancePx: 8 },
  module: { targetContentPx: 92, tolerancePx: 8 },
  large: { targetContentPx: 108, tolerancePx: 8 },
  boss: { targetContentPx: 120, tolerancePx: 6 }
};

export const DEFAULT_NORMALIZE_OPTIONS: Omit<NormalizeOptions, "targetContentPx"> = {
  cellSize: SPRITE_CELL_SIZE,
  paddingPx: 6,
  alphaThreshold: 12,
  chromaThreshold: 42
};

export const SPRITE_STYLE_GUIDE = [
  "chunky readable 2D nautical game sprite",
  "family-friendly, toy-like proportions, strong silhouette",
  "three-quarter top-down view, facing right unless the frame action says otherwise",
  "painted shapes with clean outlines, no tiny details",
  "transparent PNG final target; generate on a perfectly flat #00ff00 chroma-key background",
  "no cast shadow, no floor plane, no text, no watermark",
  "keep the whole subject centered with generous padding and no cropped edges"
].join("; ");

export const MVP_SPRITE_ASSETS: readonly SpriteAssetSpec[] = [
  {
    id: "captain",
    category: "player",
    sizeClass: "medium",
    subject: "friendly pirate captain character with compact coat, boots, and simple hat",
    frames: [
      { name: "idle", promptAction: "standing ready, facing right" },
      { name: "idle_1", promptAction: "same captain as idle reference, subtle breathing pose, facing right; change only pose", optional: true },
      { name: "walk_0", promptAction: "same captain as idle reference, walking pose frame 1, facing right; change only legs and small body tilt", optional: true },
      { name: "walk_1", promptAction: "same captain as idle reference, walking pose frame 2, facing right; opposite leg forward", optional: true },
      { name: "walk_2", promptAction: "same captain as idle reference, walking pose frame 3, facing right; passing step", optional: true },
      { name: "walk_3", promptAction: "same captain as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true }
    ]
  },
  {
    id: "fisher",
    category: "player",
    sizeClass: "medium",
    subject: "friendly raft fisher character with simple vest, rolled sleeves, and small fishing charm",
    frames: [
      { name: "idle", promptAction: "standing ready, facing right" },
      { name: "idle_1", promptAction: "same fisher as idle reference, subtle breathing pose, facing right; keep fishing gear compact", optional: true },
      { name: "walk_0", promptAction: "same fisher as idle reference, walking pose frame 1, facing right; compact fishing gear", optional: true },
      { name: "walk_1", promptAction: "same fisher as idle reference, walking pose frame 2, facing right; opposite leg forward", optional: true },
      { name: "walk_2", promptAction: "same fisher as idle reference, walking pose frame 3, facing right; passing step", optional: true },
      { name: "walk_3", promptAction: "same fisher as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true }
    ]
  },
  {
    id: "chum",
    category: "enemy",
    sizeClass: "small",
    subject: "small teal fish-like sea monster with one big eye and stubby fins",
    frames: [
      { name: "idle", promptAction: "swimming forward, facing right" },
      { name: "move_0", promptAction: "same chum as idle reference, swim cycle frame 1, facing right; tail bent up", optional: true },
      { name: "move_1", promptAction: "same chum as idle reference, swim cycle frame 2, facing right; tail centered", optional: true },
      { name: "move_2", promptAction: "same chum as idle reference, swim cycle frame 3, facing right; tail bent down", optional: true },
      { name: "move_3", promptAction: "same chum as idle reference, swim cycle frame 4, facing right; tail centered", optional: true }
    ],
    animations: [{ name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true }]
  },
  {
    id: "spitter_crab",
    category: "enemy",
    sizeClass: "small",
    subject: "orange spitter crab sea monster with raised eyes and readable claws",
    frames: [
      { name: "idle", promptAction: "scuttling, facing right" },
      { name: "move_0", promptAction: "same crab as idle reference, scuttle cycle frame 1, facing right; legs tucked", optional: true },
      { name: "move_1", promptAction: "same crab as idle reference, scuttle cycle frame 2, facing right; legs spread", optional: true },
      { name: "move_2", promptAction: "same crab as idle reference, scuttle cycle frame 3, facing right; opposite legs tucked", optional: true },
      { name: "move_3", promptAction: "same crab as idle reference, scuttle cycle frame 4, facing right; opposite legs spread", optional: true }
    ],
    animations: [{ name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true }]
  },
  {
    id: "plank_biter",
    category: "enemy",
    sizeClass: "small",
    subject: "wood-chewing plank biter creature shaped like a chomping log",
    frames: [
      { name: "idle", promptAction: "biting forward, facing right" },
      { name: "move_0", promptAction: "same plank biter as idle reference, bite cycle frame 1, facing right; jaw open", optional: true },
      { name: "move_1", promptAction: "same plank biter as idle reference, bite cycle frame 2, facing right; jaw closing", optional: true },
      { name: "move_2", promptAction: "same plank biter as idle reference, bite cycle frame 3, facing right; jaw closed", optional: true },
      { name: "move_3", promptAction: "same plank biter as idle reference, bite cycle frame 4, facing right; jaw reopening", optional: true }
    ],
    animations: [{ name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 7, loop: true }]
  },
  {
    id: "brute_turtle",
    category: "enemy",
    sizeClass: "large",
    subject: "large sturdy turtle brute sea monster with heavy shell and determined face",
    frames: [
      { name: "idle", promptAction: "lumbering forward, facing right" },
      { name: "move_0", promptAction: "same brute turtle as idle reference, heavy walk cycle frame 1, facing right", optional: true },
      { name: "move_1", promptAction: "same brute turtle as idle reference, heavy walk cycle frame 2, facing right", optional: true },
      { name: "move_2", promptAction: "same brute turtle as idle reference, heavy walk cycle frame 3, facing right", optional: true },
      { name: "move_3", promptAction: "same brute turtle as idle reference, heavy walk cycle frame 4, facing right", optional: true }
    ],
    animations: [{ name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 6, loop: true }]
  },
  {
    id: "kraken_tentacle",
    category: "enemy",
    sizeClass: "boss",
    subject: "purple kraken tentacle segment with suction cups and clear curled silhouette",
    frames: [
      { name: "idle", promptAction: "rising upward from water, centered" },
      { name: "idle_1", promptAction: "same kraken tentacle as idle reference, slight sway pose, centered", optional: true }
    ],
    animations: [{ name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true }]
  },
  {
    id: "kraken_head",
    category: "enemy",
    sizeClass: "boss",
    subject: "large purple kraken head with expressive eyes and readable mouth",
    frames: [
      { name: "idle", promptAction: "looming forward, centered" },
      { name: "idle_1", promptAction: "same kraken head as idle reference, slight breathing pose, centered; change only expression and tentacle sway", optional: true }
    ],
    animations: [{ name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true }]
  },
  {
    id: "cannon",
    category: "module",
    sizeClass: "module",
    subject: "small raft-mounted cannon with chunky barrel and metal base",
    frames: [{ name: "idle", promptAction: "top-down three-quarter view, facing right" }]
  },
  {
    id: "repair_station",
    category: "module",
    sizeClass: "module",
    subject: "compact repair station module with wood crate base, wrench mark, and bright helpful color",
    frames: [{ name: "idle", promptAction: "top-down three-quarter view, centered" }]
  },
  {
    id: "coin",
    category: "pickup",
    sizeClass: "pickup",
    subject: "single chunky gold coin pickup with bright rim",
    frames: [{ name: "idle", promptAction: "centered icon-like pickup" }]
  },
  {
    id: "salvage",
    category: "pickup",
    sizeClass: "pickup",
    subject: "small bundle of useful raft salvage: plank, rope, and nail",
    frames: [{ name: "idle", promptAction: "centered icon-like pickup" }]
  },
  {
    id: "harpoon_projectile",
    category: "projectile",
    sizeClass: "projectile",
    subject: "small harpoon projectile with rope hint and clear point",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "coconut_projectile",
    category: "projectile",
    sizeClass: "projectile",
    subject: "small coconut projectile with simple round readable shape",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "cannon_projectile",
    category: "projectile",
    sizeClass: "projectile",
    subject: "small dark cannonball projectile with bright rim highlight",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "enemy_glob",
    category: "projectile",
    sizeClass: "projectile",
    subject: "small green enemy spit glob projectile with readable splash shape",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  }
];

export function frameKey(assetId: string, frame: string): string {
  return `${assetId}/${frame}`;
}
