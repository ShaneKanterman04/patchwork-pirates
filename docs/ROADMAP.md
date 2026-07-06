# Patchwork Pirates — Phased Roadmap

**Execution:** built per [`EXECUTION.md`](EXECUTION.md) — an Opus overseer
decomposes each phase into packets and delegates them to Codex
(`gpt-5.5-codex` @ medium) workers; Shane gates phase exits and merges.

Each phase has a **goal**, **deliverables**, and a hard **exit criterion** —
a thing you can *do or observe*, not a checkbox list. Don't start phase N+1
before N's exit criterion holds; do cut scope inside a phase to get there.

Ordering rationale: the sim/netcode skeleton comes first because it's the only
architectural one-way door; content (weapons, enemies, characters) is data and
can land in any order after the primitives exist. Multiplayer is *not* deferred
to the end — it's Phase 2, before content breadth, because "2-player co-op" is
the product and retrofitting it after tuning would waste all the tuning.

---

## Build status (overseer-maintained)

Work branch `phase-0`. Legend: ✅ done & committed · 🔨 in progress · ⬜ todo.

- **Phase 0 — Skeleton & proof of feel** 🔨 (all packets built & verified; awaiting playtest)
  - ✅ 0.1 pnpm workspace + determinism lint
  - ✅ 0.2 sim tick loop + movement + dash + static raft
  - ✅ 0.3 Cutlass + Chum + targeting + combat (content-injection architecture)
  - ✅ 0.4 server match loop + WS + snapshots (protocol wire contract)
  - ✅ 0.5 PixiJS client render + interpolation + input capture
  - ⏸ exit gate — Shane playtest (open but NON-BLOCKING; Shane chose "build straight through")
- **Phase 1 — The core loop, solo** 🔨 (all packets built & verified; awaiting playtest)
  - ✅ 1.1 raft damage: tile HP/holes/repair/rebuild + core HP + movement respects holes (sim)
  - ✅ 1.2 threat-score targeting + Harpoon Gun + Coconut Launcher + projectiles (sim+content) + overseer wire-sync (explosion/tile/core WireEvents)
  - ✅ 1.3 enemies: Spitter Crab, Plank-Biter, Brute Turtle + AI primitives (sim+content)
  - ✅ 1.4 wave system: budget spawner, 8 waves, phase state machine, run lifecycle (sim+content)
  - ✅ 1.5 modules: Cannon + Repair Station (sim+content)
  - ✅ 1.6 economy: coins/pickup radius, salvage, shop, items, transactions (sim+content) [raft-expansion deferred]
  - ✅ 1.6w wire extension: Snapshot raft/core/coins/salvage/run/modules/shop + build messages (protocol+server)
  - ✅ 1.7 client: build/shop UI, raft-damage render, victory/defeat + run stats (client)
  - ⏸ exit gate — Shane playtest (full 8-wave solo run; lose 2 ways, win with 2 builds). Overseer verified the stack headlessly (97 tests, run-machine + wire + message smokes); feel/balance is Shane's.
- **Phase 2 — Co-op** 🔨 (all packets built & verified; awaiting playtest)
  - ✅ 2.1 downed/revive/bleed-out + wave-end return + party-wipe defeat (sim)
  - ✅ 2.2 characters Captain + Fisher — passives + automatic specials (sim+content)
  - ✅ 2.3 ping (Q contextual) + downed/revive + scoreboard wire (sim+protocol+server)
  - ✅ 2.4 lobby: multi-match by code, join, character select, ready-up (server+protocol)
  - ✅ 2.5 disconnect handling: drop→downed, rejoin by code resumes slot (server)
  - ✅ 2.6 co-op client UI: lobby, char select, 2nd player, revive, ping, scoreboard (client)
  - ⏸ exit gate — Shane playtest (2 machines finish a run + a mid-wave revive). Overseer verified lobby/join/character-select/run-start + disconnect→downed→rejoin over real WS.
- **Phase 3 — MVP content & the boss** 🔨
  - ✅ 3.1 The Kraken boss: tentacle-siege phases + head damage-window + Chum between (sim+content)
  - ✅ 3.2 Kraken wire + client render + attack telegraphs (≥0.75s) (protocol+server+client)
  - ✅ 3.3 headless balance harness: seeded bot runs, wave-reached/core-HP/DPS reports (new package)
  - ✅ 3.4 balance tuning pass from harness output (overseer; conservative easing — real balance is Shane's playtest)
  - note: character specials (Captain mark / Fisher priority) shipped in 2.2; readability/telegraphs in 3.2; run stats in 1.7
  - ⏸ exit gate — Shane 2-player Kraken playtest (team split; ~40–70% duo win rate). Boss/telegraphs/wire verified; feel is Shane's.
- **Phase 4 — Playtest & family polish** 🔨 (engineering items; the family-playtest exit is Shane's)
  - ✅ 4.1 feel/juice: hit flash + knockback + particles, subtle screen shake, coin/pickup juice, procedural sound (client)
  - ⏸ 4.2 movement prediction + reconciliation — DEFERRED per TECH.md (playtest-gated: only if real-internet play feels floaty; MVP ships without it). Reserved `seq` field is in place.
  - ✅ 4.3 onboarding: first-run contextual hints ("Hold E to repair!") (client)
  - ⏸ exit gate — family pair completes a run unassisted + asks to play again (observational; Shane's)
- **Phase 5 — Content breadth** 🔨 (started)
  - ✅ 5.0 raft expansion: sparse growable grid + build_tile action (build phase, edge-adjacent,
    5 salvage, 60-tile cap, negative coords), dashed buildable-water markers + gold nearest pulse,
    viewport auto-fit, shop "Build Deck Tile" button, tile_built juice + hint (sim+protocol+server+content+client)
  - ✅ 5.1 weapons slice: Anchor Flail (orbit primitive), Seagull Bell (dive), Leaky Bucket
    (trail → ground-hazard system), Crab Trap (trap); replaceable 4-slot loadout (sell_weapon,
    half-price refund, keep ≥1); loadout UI (Weapons n/4, Sell buttons, slots-full copy);
    hazard wire (Snapshot.hazards + trap_triggered) + client render/audio
  - ✅ 5.2 full session loop: menu (generated title art), lobby room, Play Again (rematch,
    fresh seed, crew+selections preserved), Back to Menu (leave/left wire), client screen
    machine + run-state reset
  - ✅ 5.3 enemies: Leaper (leap), Coin Thief (steal/flee/drop), Bloater (death explosion),
    Screamer (speed-buff scream + enemy_screamed wire) — defs, waves 3-6, full generated
    animation sets, client juice
  - ⬜ remaining Phase 5 slices (enemies/modules/characters) — see below
- Phase 6 ⬜ post-MVP (meta & ship)

Perf note (2026-07-05): client renderer is retained-mode with pooled VFX and adaptive quality
tiers (`quality.ts`); use `?debug=perf` for FPS/tier/leak overlay. Keep new render code
draw-once-then-transform — no per-frame Graphics rebuilds.

---

## Phase 0 — Skeleton & proof of feel (~1 week)

**Goal:** prove "moving while my weapon fights for me" is fun on the wire
architecture we'll keep.

- pnpm workspace with `sim` / `protocol` / `server` / `client` packages wired
  up (see TECH.md layout), determinism lint rule in place.
- Fixed-tick sim loop: one player, WASD movement + dash on a static 5×5 raft
  (tiles visual-only for now), water border.
- One auto-weapon (**Cutlass**, `nearest` targeting) vs one enemy (**Chum**)
  spawning in a trickle from the water. Damage, enemy death, coin drop
  (uncollectable is fine).
- Server-authoritative even solo: client connects over a real WebSocket to a
  local server process, renders interpolated snapshots.
- Placeholder art: colored shapes + labels. No sound. No UI beyond an HP bar.

**Exit criterion:** you can kite a Chum pack in circles on the raft while the
cutlass auto-slashes, over a real WS connection, at a steady 30 Hz sim / 60 fps
render — and it already feels a little bit good.

**Kill signal to respect:** if auto-cutlass-vs-swarm feels dead even after a
day of tuning (arc size, cooldown, enemy speed), the fix is in GDD numbers, not
in adding features. Iterate here; this phase is cheap on purpose.

## Phase 1 — The core loop, solo (~2 weeks)

**Goal:** a complete single-player run exists: waves → shop/build → waves →
win/lose. This is the game with the co-op removed.

- Raft becomes real: tile HP, holes (impassable), core with HP, repair via
  held E, broken-tile rebuild.
- Wave system: budget-based spawner, 8 waves, ramping lengths; wave/build
  phase state machine with the 45s skippable timer.
- Enemies 2–4: **Spitter Crab** (ranged), **Plank-Biter** (tile-eater),
  **Brute Turtle** (tank) — with the steering/AI primitives they need.
- Weapons 2–3: **Harpoon Gun** (`attacking_raft` targeting + pull/slow),
  **Coconut Launcher** (`densest_cluster` + AoE). Threat-score targeting
  module with unit tests.
- Economy v1: coin pickups + pickup radius, personal shop (4 offers, reroll,
  lock, prices by wave), salvage + build-phase tile/module placement (mouse).
- Modules: **Cannon**, **Repair Station**.
- Victory/defeat screens with basic run stats.

**Exit criterion:** one person can play a full 8-wave solo run (no boss yet —
wave 8 is just a big wave) and lose it two different ways (core destroyed,
player death) and win it with two different builds (melee-stack vs
launcher-stack).

## Phase 2 — Co-op (~1–2 weeks)

**Goal:** two people, two browsers, one raft.

- Lobby: create/join by code, character select (Captain/Fisher — this is
  where characters enter, since their point is co-op roles), ready-up.
- 2 players in the sim: per-player input channels, downed/bleed-out/revive
  (hold-E, interruptible), wave-end return, party-wipe defeat.
- Per-player coins/shops in the build phase; shared salvage pool with both
  clients able to place.
- Ping (Q, contextual) and scoreboard (Tab).
- Player-count scaling knobs (enemy budget/HP per player) — rough numbers.
- Disconnect handling: player drops → their pirate goes downed; rejoin by
  code resumes the slot. (Host-server dies → run dies; acceptable for MVP.)

**Exit criterion:** two people on two machines (real network, not localhost)
finish a full run together, including at least one mid-wave revive and one
argument about what to spend salvage on. No desyncs — what player A sees
match what player B sees.

## Phase 3 — MVP content & the boss (~2 weeks)

**Goal:** the locked MVP scope from GDD §12 is fully present and tuned.

- **The Kraken:** multi-edge tentacle phases, head-surfacing damage window,
  Chum spawns between phases. First scripted encounter — build it on the
  wave-system primitives, resist making it special-cased code.
- Character specials for real: Captain's auto-mark, Fisher's pickup radius +
  harpoon priority.
- Balance pass with the **headless balance harness** (TECH.md): seeded bot
  runs across builds/waves; tune the wave budget curve, prices, weapon DPS.
- Full placeholder-art readability pass: distinct enemy silhouettes, tile
  damage states, telegraphs (≥0.75s), downed/revive indicators.
- Run stats screen worth screenshotting ("34 tiles repaired!").

**Exit criterion:** a 2-player run ends at the Kraken and the fight forces at
least one team split (someone holds a tentacle side while someone repairs) —
observed in a real playtest, not asserted. Win rate for a competent duo lands
roughly 40–70%.

## Phase 4 — Playtest & family polish (~2 weeks, overlaps 3)

**Goal:** the target audience (a family, mixed ages) plays it unassisted and
wants a second run.

- 3+ external playtests (including at least one adult+kid pair). Watch, don't
  coach. Fix the top confusion each round before the next.
- Feel work: hit feedback (flash/knockback/particles), screen shake (subtle),
  basic sound pass, coin/pickup juice — auto-combat lives or dies on feedback
  since the player never presses the attack.
- Movement prediction + reconciliation for own-player if playtests over real
  internet feel floaty (this is the deferred `seq` work from TECH.md).
- Onboarding: first-wave contextual hints ("Hold E to repair!"), no tutorial
  level.
- Decide the GDD §15 open questions from observed play; update the GDD.

**Exit criterion:** a family pair completes a run with zero questions to the
developer, and at least one playtest group asks to play again unprompted.
That's the MVP done.

## Phase 5 — Content breadth (post-MVP, ongoing)

Now that weapons/enemies are data, this phase is parallelizable and shippable
in slices — each slice is (content + the one new sim primitive it needs):

- Remaining characters, each gated on its system: **Carpenter** (repair
  pulses), **Cook** (food/meal drops), **Storm Witch** (weather: rain + wet
  status), **Goblin Stowaway** (junk outcome table).
- One weapon per remaining category first (orbit → Anchor Flail, summon →
  Seagull Bell, trail → Leaky Bucket, trap → Crab Trap), then fill categories.
- Post-MVP enemies: Leaper, Coin Thief, Bloater, Screamer.
- Post-MVP modules: Net, Spike Rail, Kitchen, Harpoon Turret.
- Weapon upgrade tiers; 3–4 player support (scaling was built in Phase 2).
- Difficulty settings ("Calm Seas" / "Storm").

## Phase 6 — Meta & ship (when 5 proves out)

- Meta-progression: character/weapon unlocks across runs (needs persistence —
  first real storage decision).
- Run variety: 2–3 "seas" (arena/spawn-table themes), weather system as a
  wave modifier.
- Public build: hosting, lobby browser or link-invites, protocol versioning
  turned on, gamepad mapping (free, since there's no cursor).
- Then decide: itch.io web release vs. wrapping for Steam.

---

## Standing risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Auto-combat feels passive ("the game plays itself") | Phase 0 exists to catch this in week 1; the levers are enemy pressure on *the player's body and raft*, not weapon numbers |
| Multiplayer scope spiral | Server-authoritative from day 0, no offline fork, prediction deferred until playtests demand it |
| Content requires code (every weapon a special case) | TECH.md rule: content is data + a small primitive set; review each new weapon against it |
| Tuning treadmill | Headless balance harness in Phase 3 before hand-tuning |
| Kraken becomes a month-long boss project | It's built from wave/spawn/tile primitives + a script; if it needs a new engine feature, cut the feature, not the schedule |
| Family playtesters unavailable / feedback ignored | Phase 4 exit criterion is observational and blocking on purpose |
