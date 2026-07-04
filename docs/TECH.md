# Patchwork Pirates — Tech & Architecture

## Stack (recommended)

| Layer | Choice | Why |
| --- | --- | --- |
| Language | **TypeScript everywhere** | One language for sim, server, client; the GDD's data types are already TS |
| Client rendering | **PixiJS** + Vite | Lightweight 2D WebGL, no engine lock-in, full control over the render loop (Phaser is the fallback if we want more batteries) |
| Server | **Node.js + `ws`** (raw WebSockets) | The protocol is tiny; no need for socket.io rooms magic. Swap to uWebSockets.js only if perf demands |
| Shared sim | **`packages/sim`** — pure TS, zero DOM/Node deps | Runs headless on the server, in tests, and (later) client-side for prediction |
| State | In-memory per match | No DB in MVP; a match is ephemeral. Lobby codes, not accounts |
| Content | **Data files** (`packages/content`, typed TS objects) | Weapons/enemies/modules/waves are definitions, not code — see below |

Decision point flagged, not blocking: if we ever want Steam/native, Godot would
have been the alternative fork in the road. Everything below assumes web/TS;
the auto-combat design (server owns combat, thin input) is engine-agnostic
insurance anyway.

## Repo layout

```text
patchwork-pirates/
├── docs/                  # GDD, TECH, ROADMAP
├── packages/
│   ├── sim/               # deterministic game simulation (pure TS)
│   │   ├── world.ts       # tick(state, inputs) -> state
│   │   ├── weapons.ts     # cooldowns, targeting, attack resolution
│   │   ├── targeting.ts   # TargetingMode impls + threat score
│   │   ├── enemies.ts     # spawning, AI steering
│   │   ├── raft.ts        # tiles, holes, core, modules
│   │   └── ...
│   ├── content/           # weapon/enemy/module/wave/character definitions
│   ├── protocol/          # message types, snapshot encoding (shared wire contract)
│   ├── server/            # Node: lobby, match loop, WS transport
│   └── client/            # PixiJS: render, interpolation, input capture, UI
└── package.json           # pnpm workspace
```

`protocol/` plays the role `crates/contracts` plays in Hostlet: the one place
wire shapes live, imported by both sides, kept backward-compatible within a
release.

## Architecture: server-authoritative from day 0

The auto-combat rule makes this cheap, so take the win immediately:

- **The server runs the only real simulation.** All combat — weapon cooldowns,
  target selection, projectiles, hits, damage, enemy AI, module fire, spawns,
  loot — happens in `sim` on the server. The client never decides an outcome.
- **The client is a renderer + input sampler.** It draws interpolated
  snapshots and sends inputs. "Local play" = spinning the server up in-process
  (or same machine); there is no separate offline code path to maintain.
- **Why this is safe for feel:** the only latency-sensitive verb is movement.
  MVP ships with *no client prediction* — at LAN/regional pings (<80ms),
  interpolated own-movement is acceptable for a chaos co-op game. Movement
  prediction + reconciliation (that's what `seq` is for) is a Phase 4 polish
  item, not a foundation risk, because inputs are just a movement vector.

### Tick model

```text
sim tick:        30 Hz fixed timestep (accumulator loop)
snapshot send:   15 Hz (every 2nd tick), interest = whole arena (it's one raft)
client render:   rAF, interpolating between the two latest snapshots (~100ms behind)
input send:      every client frame, coalesced; server applies latest-known per tick
```

### Determinism rules for `sim`

- No `Date.now()`, no `Math.random()` — the world state carries a seeded PRNG
  (mulberry32 is fine) and a tick counter. Same seed + same inputs = same run.
- All time in ticks, not ms. All content numbers defined per-second in
  `content/` and converted to per-tick at load.
- Zero imports from DOM, Node, PixiJS, or `protocol` (sim is the innermost
  layer). Enforced with an ESLint `no-restricted-imports` rule from day 0.
- Payoff: headless balance tests ("simulate wave 5 with build X 200 times"),
  bug repro from a (seed, input-log) pair, and free future replays.

## Wire protocol

Client → server (the *entire* combat input surface):

```ts
type PlayerInputMessage = {
  type: "player_input";
  seq: number;                       // reserved for Phase 4 prediction
  movement: { x: number; y: number }; // normalized, server clamps
  interact: boolean;                  // E held
  dash: boolean;                      // edge-triggered
  ping?: { x: number; y: number; kind: "danger" | "repair" | "loot" | "group" };
};
```

Plus lobby/build-phase messages (join, ready, buy, reroll, lock, place_tile,
place_module) — these are transactional request/ack, not per-tick.

Server → client:

```ts
type SnapshotMessage = {
  type: "snapshot";
  tick: number;
  players: PlayerView[];    // pos, hp, downed, weapon slots (ids only)
  enemies: EnemyView[];     // id, type, pos, hp ratio, attackingTileId?
  projectiles: ProjView[];  // pos, vel, typeId  (client extrapolates between snapshots)
  raft: RaftDelta;          // changed tiles/modules only (full raft on join/phase change)
  pickups: PickupView[];
  wave: { number: number; phase: "combat" | "build"; timeLeft: number };
};
type EventMessage =         // reliable one-shots the client must not miss
  | { type: "hit"; ... } | { type: "tile_broken"; ... } | { type: "player_downed"; ... }
  | { type: "wave_end"; ... } | { type: "shop_state"; ... } | { type: "game_over"; ... };
```

JSON for MVP (debuggable, fast enough at 15 Hz for <100 entities); a binary
encoding in `protocol/` is a drop-in later because both sides import the same
encoder.

## Performance notes (known, not premature)

- **Targeting cost:** every weapon/module scanning every enemy is O(W×E) per
  tick. Fine at MVP scale (≤6 weapon instances + 4 modules × ≤60 enemies). The
  fix when needed is a **spatial hash grid** in `sim` + re-target every 5 ticks
  instead of every tick — design targeting behind a `selectTarget(world, weapon)`
  function now so the optimization is invisible later.
- **`densest_cluster`:** don't do real clustering; score each enemy by
  neighbors-within-radius using the spatial grid, pick the max. Good enough,
  cheap, deterministic.
- **Entity churn:** projectiles and Chum swarms come and go fast — pool them
  in the client renderer (Pixi sprite pools); the sim can just use arrays +
  free-lists.

## Testing strategy

- `sim` gets real unit tests from Phase 0: targeting selection tables,
  threat-score ordering, tile break/repair state machine, wave budget spending,
  downed/revive timers. These are cheap because sim is pure and headless.
- **Balance harness (Phase 3):** headless script that runs N seeded sims with
  scripted "player bots" (stand-and-fight, kite-in-circles, repair-priority)
  and reports wave-reached / core-HP curves. Catches "wave 6 is a wall"
  without playtests.
- Client gets smoke tests only in MVP (it renders; the sim is the game).

## Two engineering rules (borrowed from what already works in this workspace)

1. **Content is data.** New weapon/enemy = new entry in `packages/content` +
   at most one new effect primitive in sim. If adding a weapon needs a new
   `if` in `world.ts`, the primitive set is wrong — fix that instead.
2. **Wire shapes are contracts.** Changes to `protocol/` must be additive
   (`?` fields with defaults) within a phase; breaking changes bump a protocol
   version checked at lobby join.
