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
      { name: "walk_3", promptAction: "same captain as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true },
      { name: "attack_0", promptAction: "same captain as idle reference, cutlass swing windup pose, facing right; change only arms and body tilt", optional: true },
      { name: "attack_1", promptAction: "same captain as idle reference, cutlass swing follow-through pose, facing right; change only arms and body tilt", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
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
      { name: "walk_3", promptAction: "same fisher as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true },
      { name: "attack_0", promptAction: "same fisher as idle reference, fishing cast windup pose, facing right; change only arms, rod, and body tilt", optional: true },
      { name: "attack_1", promptAction: "same fisher as idle reference, fishing cast follow-through pose, facing right; line arcing forward compactly", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "carpenter",
    category: "player",
    sizeClass: "medium",
    subject: "friendly shipwright character with tool belt, rolled sleeves, sturdy apron, and small hammer at hip",
    frames: [
      { name: "idle", promptAction: "standing ready, facing right" },
      { name: "idle_1", promptAction: "same carpenter as idle reference, subtle breathing pose, facing right; change only pose", optional: true },
      { name: "walk_0", promptAction: "same carpenter as idle reference, walking pose frame 1, facing right; change only legs and small body tilt", optional: true },
      { name: "walk_1", promptAction: "same carpenter as idle reference, walking pose frame 2, facing right; opposite leg forward", optional: true },
      { name: "walk_2", promptAction: "same carpenter as idle reference, walking pose frame 3, facing right; passing step", optional: true },
      { name: "walk_3", promptAction: "same carpenter as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true },
      { name: "attack_0", promptAction: "same carpenter as idle reference, overhead mallet windup pose, facing right; change only arms and body tilt", optional: true },
      { name: "attack_1", promptAction: "same carpenter as idle reference, mallet smash follow-through pose, facing right; change only arms and body tilt", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "cook",
    category: "player",
    sizeClass: "medium",
    subject: "cheery sea-cook character with apron, kerchief, slight belly, and ladle at belt",
    frames: [
      { name: "idle", promptAction: "standing ready, facing right" },
      { name: "idle_1", promptAction: "same cook as idle reference, subtle breathing pose, facing right; change only pose", optional: true },
      { name: "walk_0", promptAction: "same cook as idle reference, walking pose frame 1, facing right; change only legs and small body tilt", optional: true },
      { name: "walk_1", promptAction: "same cook as idle reference, walking pose frame 2, facing right; opposite leg forward", optional: true },
      { name: "walk_2", promptAction: "same cook as idle reference, walking pose frame 3, facing right; passing step", optional: true },
      { name: "walk_3", promptAction: "same cook as idle reference, walking pose frame 4, facing right; opposite passing step", optional: true },
      { name: "attack_0", promptAction: "same cook as idle reference, frying-pan swat windup pose, facing right; change only arms and body tilt", optional: true },
      { name: "attack_1", promptAction: "same cook as idle reference, frying-pan swat follow-through pose, facing right; change only arms and body tilt", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "walk", frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
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
      { name: "move_3", promptAction: "same chum as idle reference, swim cycle frame 4, facing right; tail centered", optional: true },
      { name: "attack_0", promptAction: "same chum as idle reference, bite lunge windup pose, facing right; jaw open and body reared back", optional: true },
      { name: "attack_1", promptAction: "same chum as idle reference, bite lunge strike pose, facing right; snapping forward with readable teeth", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
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
      { name: "move_3", promptAction: "same crab as idle reference, scuttle cycle frame 4, facing right; opposite legs spread", optional: true },
      { name: "attack_0", promptAction: "same crab as idle reference, spit windup pose, facing right; claws raised and cheeks puffed", optional: true },
      { name: "attack_1", promptAction: "same crab as idle reference, spit burst strike pose, facing right; small green glob ejecting forward", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "leaper",
    category: "enemy",
    sizeClass: "small",
    subject: "sleek flying-fish-like leaper sea monster with blade-like fins and coiled energy",
    frames: [
      { name: "idle", promptAction: "coiled and ready to spring, facing right" },
      { name: "move_0", promptAction: "same leaper as idle reference, swim cycle frame 1, facing right; fins tucked and body coiled", optional: true },
      { name: "move_1", promptAction: "same leaper as idle reference, swim cycle frame 2, facing right; fins slicing outward", optional: true },
      { name: "move_2", promptAction: "same leaper as idle reference, swim cycle frame 3, facing right; body stretched forward", optional: true },
      { name: "move_3", promptAction: "same leaper as idle reference, swim cycle frame 4, facing right; fins resetting and tail tucked", optional: true },
      { name: "attack_0", promptAction: "same leaper as idle reference, crouched coil, about to spring, facing right; blade fins tight", optional: true },
      { name: "attack_1", promptAction: "same leaper as idle reference, mid-leap lunge, facing right; fins spread like blades", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "coin_thief",
    category: "enemy",
    sizeClass: "small",
    subject: "shifty magpie-crab hybrid sea monster with a little loot satchel and greedy eyes",
    frames: [
      { name: "idle", promptAction: "sneaking forward with greedy eyes, facing right" },
      { name: "move_0", promptAction: "same coin thief as idle reference, scuttle cycle frame 1, facing right; satchel tucked close", optional: true },
      { name: "move_1", promptAction: "same coin thief as idle reference, scuttle cycle frame 2, facing right; claws lifted and feet spread", optional: true },
      { name: "move_2", promptAction: "same coin thief as idle reference, scuttle cycle frame 3, facing right; satchel bouncing slightly", optional: true },
      { name: "move_3", promptAction: "same coin thief as idle reference, scuttle cycle frame 4, facing right; opposite claws lifted", optional: true },
      { name: "attack_0", promptAction: "same coin thief as idle reference, reaching claw toward a coin, facing right; greedy eyes focused", optional: true },
      { name: "attack_1", promptAction: "same coin thief as idle reference, stuffing coin in satchel, facing right; little loot bag open", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
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
      { name: "move_3", promptAction: "same plank biter as idle reference, bite cycle frame 4, facing right; jaw reopening", optional: true },
      { name: "attack_0", promptAction: "same plank biter as idle reference, board-chomp windup pose, facing right; jaw opened wide and body pulled back", optional: true },
      { name: "attack_1", promptAction: "same plank biter as idle reference, board-chomp strike pose, facing right; snapping down on a small plank edge", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
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
      { name: "move_3", promptAction: "same brute turtle as idle reference, heavy walk cycle frame 4, facing right", optional: true },
      { name: "attack_0", promptAction: "same brute turtle as idle reference, shell ram windup pose, facing right; body crouched and shell angled back", optional: true },
      { name: "attack_1", promptAction: "same brute turtle as idle reference, shell ram strike pose, facing right; lunging forward with heavy shell leading", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "bloater",
    category: "enemy",
    sizeClass: "large",
    subject: "bloated pufferfish-blob sea monster, ominously swollen with patchy warts",
    frames: [
      { name: "idle", promptAction: "wobbling forward, ominously swollen, facing right" },
      { name: "move_0", promptAction: "same bloater as idle reference, slow wobble cycle frame 1, facing right; body sagging low", optional: true },
      { name: "move_1", promptAction: "same bloater as idle reference, slow wobble cycle frame 2, facing right; body squashing wide", optional: true },
      { name: "move_2", promptAction: "same bloater as idle reference, slow wobble cycle frame 3, facing right; body bobbing upward", optional: true },
      { name: "move_3", promptAction: "same bloater as idle reference, slow wobble cycle frame 4, facing right; body settling with warts readable", optional: true },
      { name: "attack_0", promptAction: "same bloater as idle reference, swelling bigger, facing right; round body inflating ominously", optional: true },
      { name: "attack_1", promptAction: "same bloater as idle reference, about to burst, facing right; spikes flared and body stretched tight", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "screamer",
    category: "enemy",
    sizeClass: "small",
    subject: "banshee-eel sea monster with a huge open mouth and sound-ring motifs",
    frames: [
      { name: "idle", promptAction: "hovering forward with huge mouth ready, facing right" },
      { name: "move_0", promptAction: "same screamer as idle reference, eel swim cycle frame 1, facing right; body curved upward", optional: true },
      { name: "move_1", promptAction: "same screamer as idle reference, eel swim cycle frame 2, facing right; body stretched and mouth tense", optional: true },
      { name: "move_2", promptAction: "same screamer as idle reference, eel swim cycle frame 3, facing right; body curved downward", optional: true },
      { name: "move_3", promptAction: "same screamer as idle reference, eel swim cycle frame 4, facing right; body centered with sound-ring motifs", optional: true },
      { name: "attack_0", promptAction: "same screamer as idle reference, deep inhale, cheeks puffed, facing right; mouth rounded", optional: true },
      { name: "attack_1", promptAction: "same screamer as idle reference, mid-scream, mouth wide, facing right; visible ring lines", optional: true }
    ],
    animations: [
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "kraken_tentacle",
    category: "enemy",
    sizeClass: "boss",
    subject: "purple kraken tentacle segment with suction cups and clear curled silhouette",
    frames: [
      { name: "idle", promptAction: "rising upward from water, centered" },
      { name: "idle_1", promptAction: "same kraken tentacle as idle reference, slight sway pose, centered", optional: true },
      { name: "move_0", promptAction: "same kraken tentacle as idle reference, swim sway cycle frame 1, centered; curl leaning left", optional: true },
      { name: "move_1", promptAction: "same kraken tentacle as idle reference, swim sway cycle frame 2, centered; curl upright", optional: true },
      { name: "move_2", promptAction: "same kraken tentacle as idle reference, swim sway cycle frame 3, centered; curl leaning right", optional: true },
      { name: "move_3", promptAction: "same kraken tentacle as idle reference, swim sway cycle frame 4, centered; curl upright", optional: true },
      { name: "attack_0", promptAction: "same kraken tentacle as idle reference, raised coil windup pose, centered; tip lifted high", optional: true },
      { name: "attack_1", promptAction: "same kraken tentacle as idle reference, downward slam strike pose, centered; tip slamming down with strong curve", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true },
      { name: "attack", frames: ["attack_0", "attack_1"], fps: 6, loop: false }
    ]
  },
  {
    id: "kraken_head",
    category: "enemy",
    sizeClass: "boss",
    subject: "large purple kraken head with expressive eyes and readable mouth",
    frames: [
      { name: "idle", promptAction: "looming forward, centered" },
      { name: "idle_1", promptAction: "same kraken head as idle reference, slight breathing pose, centered; change only expression and tentacle sway", optional: true },
      { name: "move_0", promptAction: "same kraken head as idle reference, phase-driven looming cycle frame 1, centered; eyes narrowed slightly", optional: true },
      { name: "move_1", promptAction: "same kraken head as idle reference, phase-driven looming cycle frame 2, centered; head lifted slightly", optional: true },
      { name: "move_2", promptAction: "same kraken head as idle reference, phase-driven looming cycle frame 3, centered; mouth opened slightly", optional: true },
      { name: "move_3", promptAction: "same kraken head as idle reference, phase-driven looming cycle frame 4, centered; head settled back", optional: true }
    ],
    animations: [
      { name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true },
      { name: "move", frames: ["move_0", "move_1", "move_2", "move_3"], fps: 8, loop: true }
    ]
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
    id: "food",
    category: "pickup",
    sizeClass: "small",
    subject: "hearty stew bowl with steam curl",
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
    id: "powder_keg_toss",
    category: "projectile",
    sizeClass: "small",
    subject: "wooden powder keg projectile with a lit sparking fuse",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "swordfish_rapier",
    category: "projectile",
    sizeClass: "small",
    subject: "slim silver swordfish-bill dart projectile, pointing right",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "enemy_glob",
    category: "projectile",
    sizeClass: "projectile",
    subject: "small green enemy spit glob projectile with readable splash shape",
    frames: [{ name: "idle", promptAction: "flying right, centered" }]
  },
  {
    id: "anchor_flail",
    category: "weapon",
    sizeClass: "small",
    subject: "compact iron anchor weapon on a short chain",
    frames: [{ name: "idle", promptAction: "top-down three-quarter view, compact iron anchor with short chain, centered", optional: true }]
  },
  {
    id: "seagull_bell",
    category: "weapon",
    sizeClass: "small",
    subject: "small summoned seagull weapon marker with bright bell accent",
    frames: [
      { name: "idle", promptAction: "gull diving and pointing down, wings swept back, centered", optional: true },
      { name: "idle_1", promptAction: "same seagull bell as idle reference, wings flared while diving down, centered", optional: true }
    ],
    animations: [{ name: "idle", frames: ["idle", "idle_1"], fps: 6, loop: true }]
  },
  {
    id: "puddle",
    category: "weapon",
    sizeClass: "small",
    subject: "translucent water puddle hazard viewed top-down",
    frames: [
      { name: "idle", promptAction: "translucent water puddle top-down, centered, readable ripple edge", optional: true },
      { name: "idle_1", promptAction: "same puddle as idle reference, subtle ripple variation, centered; change only water ripple shape", optional: true }
    ],
    animations: [{ name: "idle", frames: ["idle", "idle_1"], fps: 2, loop: true }]
  },
  {
    id: "trap",
    category: "weapon",
    sizeClass: "small",
    subject: "armed snap-trap hazard with chunky metal jaws",
    frames: [{ name: "idle", promptAction: "armed snap-trap with jaws open, top-down three-quarter view, centered", optional: true }]
  }
];

export function frameKey(assetId: string, frame: string): string {
  return `${assetId}/${frame}`;
}
