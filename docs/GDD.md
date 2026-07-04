# Patchwork Pirates — Game Design Document

**Genre:** Co-op auto-combat survival roguelite (wave defense)
**Players:** 1–4 online co-op (MVP: 2)
**Platform:** Web (desktop browser), keyboard-only during combat
**Comparables:** Brotato, Vampire Survivors (combat feel) × Raft/Overcooked (shared-space co-op pressure)

> **Pitch:** Patchwork Pirates is a co-op auto-combat survival roguelite where
> players move, dodge, repair, and build a shared raft while their weapons
> automatically fight off waves of sea monsters.
>
> **Short pitch:** Brotato on a breakable raft, but co-op.

---

## 1. Design Pillars

1. **Combat is fully automatic.** No aiming, no attack button, no skill shots.
   Weapons pick targets and fire on their own. This is a *hard rule* — see §2.
2. **The raft is the second player character.** It takes damage, it gets
   rebuilt, and protecting it creates the decisions aiming would otherwise
   provide.
3. **Skill is positioning and triage.** Where you stand, what you kite, which
   fire you put out first, when you revive.
4. **Family-playable.** One hand on WASD, one on E/Space. A 8-year-old and a
   parent can both contribute. Chaos is fun, failure is gentle, runs are short.
5. **Co-op tension without friction.** Shared raft, shared defeat, but no
   friendly fire, no loot stealing, no way to grief.

## 2. The Hard Rule: Fully Automatic Combat

During waves, players do **not** aim or fire weapons. Weapons automatically
choose targets and attack based on their behavior definition.

The game should feel like:

> "I am moving through danger while my build fights for me."

Not:

> "I am aiming and shooting enemies."

Explicitly banned, forever (not just MVP):

- Aiming (mouse or twin-stick)
- A manual attack/fire button
- Aimed or targeted active abilities
- Manual module control (aiming cannons, triggering traps)
- Animation canceling, combos, rapid hotkeys

Every proposed feature gets tested against this rule. If it needs a mouse or a
combat keypress beyond move/dash/interact/ping, it's rejected or redesigned as
an automatic behavior the player influences *by moving*.

**Why this rule also helps engineering:** with no aim/fire input, the server
owns all combat outcomes. Client input is tiny (movement vector + 3 booleans),
latency tolerance is high, and client-side prediction is only needed for
movement. See `TECH.md`.

## 3. Core Loop

```text
RUN (one session, ~20–30 min)
└── 8 waves (MVP), each:
    ├── WAVE PHASE (30–75s): enemies attack from the water on all sides.
    │   Players move, kite, repair, revive, grab loot. Weapons fight.
    └── BUILD PHASE (45s, skippable when all players ready):
        ├── personal shop: weapons + items (per-player coins)
        └── raft build: place/repair tiles and modules (shared salvage)
Wave 8 = boss. Survive it → victory screen. Core destroyed or full party
wipe → defeat screen with run stats.
```

Meta-progression (unlocking characters/weapons across runs) is post-MVP; a run
is self-contained.

## 4. Controls

### In-wave (keyboard only, no mouse)

| Action | Input |
| --- | --- |
| Move | WASD / arrow keys |
| Interact / repair / revive / pick up | E (hold for channels) |
| Dash | Space or Shift |
| Ping (contextual) | Q |
| Scoreboard | Tab (hold) |

Two full movement mappings (WASD *and* arrows) so two players can share a
keyboard locally if we ever want couch play; gamepad mapping is trivial later
because there is no cursor.

### Build phase (mouse allowed)

| Action | Input |
| --- | --- |
| Select shop item / buy | Mouse click |
| Place raft tile/module | Mouse click |
| Rotate module (post-MVP) | R |
| Ready up | Enter / button click |

MVP raft modules are one tile and symmetric — no rotation needed.

**Ping (Q)** is contextual, no menu: pinging an enemy = danger, a damaged tile
= repair, loot = loot, open water/deck = "group here". One button, four
meanings, resolved by what's under the player's position/facing.

## 5. The Player

- **Stats:** Max HP, move speed, damage %, attack speed %, range %, armor,
  luck, repair speed. (Brotato-style flat+percent item modifiers.)
- **Baseline:** 100 HP, ~4 tiles/sec move speed.
- **Dash:** short burst (~0.2s, ~3× speed), 3s cooldown. No i-frames in MVP —
  dash is for positioning, not dodging bullets frame-perfectly. Revisit only
  if playtests demand it.
- **Weapon slots:** 4 (starting weapon occupies slot 1). Duplicate weapons
  allowed and encouraged (Brotato-style stacking).
- **No friendly fire.** Player AoE and modules never hurt players or the raft.

### Downed & revive (family-friendly rules)

- At 0 HP a player is **downed**, not dead: immobile, weapons stop, 30s
  bleed-out timer.
- Any teammate can revive: hold E for 3s (interruptible by taking a hit).
  Revived at 30% HP.
- If the bleed-out timer expires, the player is out **for the rest of the
  wave only** and returns automatically at wave end with 30% HP.
- **Defeat** = raft core destroyed, or every player downed/out simultaneously.
- Solo play: downed = defeat (nobody to revive you), so solo is the "hard
  mode" by nature; fine for MVP testing.

## 6. The Raft

The raft is a tile grid floating in open water. Enemies swim/fly in from all
sides; some attack players, some attack the raft itself.

- **Deck tiles:** start 5×5 (MVP). Each tile has HP (100). Players and enemies
  stand on tiles.
- **Broken tiles:** at 0 HP a tile becomes a **hole** — impassable to players,
  and the raft's silhouette shrinks (less room to kite = escalating pressure).
  Repairing (hold E) restores a broken tile from the hole state; it's slower
  than topping up a damaged tile.
- **The Core (the Mast):** a special center tile with its own HP pool (500).
  If it's destroyed the run ends. Enemies that reach it attack it directly.
  The core cannot be moved (MVP).
- **Edges matter:** most raft-attacker enemies chew the outermost tiles first,
  so the raft erodes inward toward the core — the defeat spiral is legible.
- **Building:** during build phase, spend shared **salvage** to place new deck
  tiles (must be edge-adjacent) and modules (on any intact tile). The raft
  layout is a *team* build the same way a character sheet is a personal build.

### Modules (all automatic)

Players place modules between waves; modules operate on their own. Nobody ever
aims a cannon.

| Module | Automatic behavior | MVP? |
| --- | --- | --- |
| **Cannon** | Shoots enemies in the water on its side of the raft. | ✅ |
| **Repair Station** | Slowly auto-repairs nearby tiles; players standing next to it repair faster. | ✅ |
| **Net** | Pulls floating loot toward the raft. | post-MVP |
| **Spike Rail** | Damages enemies that board the raft over that edge. | post-MVP |
| **Kitchen** | Produces a food pickup every few waves. | post-MVP |
| **Harpoon Turret** | Yanks raft-attacking enemies away from important tiles. | post-MVP |

Modules have HP and can be destroyed (dropping salvage refund is post-MVP;
MVP: destroyed = gone, teaches protection).

## 7. Combat System

### 7.1 Weapon anatomy

Every weapon is data, not code. A weapon definition includes:

```text
id, name, tags (melee/ranged/aoe/summon/orbit/trail/trap, element)
targeting mode        (see 7.2)
attack pattern        (slash arc, projectile, lob, orbit, pulse, spawn)
cooldown, range, damage, projectile speed/count
special effects       (knockback, pull, slow, stun, chain, burn ...)
upgrade path          (per-tier stat deltas / effect unlocks)
```

### 7.2 Targeting

The **server** selects targets. Base modes:

```ts
type TargetingMode =
  | "nearest"            // nearest enemy to the wielder
  | "nearest_to_core"    // defensive
  | "attacking_raft"     // enemies currently chewing tiles, else nearest
  | "highest_hp"
  | "lowest_hp"
  | "densest_cluster"    // AoE weapons
  | "random"
  | "boss_or_elite";     // priority targets, else nearest
```

Modes that need tie-breaking use a shared **threat score**:

```text
threatScore =
    enemyBasePriority        // per enemy type
  + raftAttackBonus          // attacking core >> attacking cannon >> attacking deck tile
  + bossBonus + eliteBonus
  + lowHealthBonus           // finish-off preference (some weapons)
  - distancePenalty
```

The player never picks a target directly; the player influences targeting **by
moving** (all ranges are wielder-centered) and **by building** (defensive
weapons care about what the enemies attack).

### 7.3 Weapon categories

Different auto-patterns so weapons feel distinct without any aiming:

| Category | Pattern | Player skill | Examples |
| --- | --- | --- | --- |
| **Nearest-target** | Reliable single-target | Positioning to line up multi-hits | Cutlass, Water Pistol, Lightning Rod |
| **Cluster-target** | AoE at densest group | Kiting enemies into clumps | Coconut Launcher, Bottle Cannon, Firework Rack |
| **Defensive-target** | Prioritizes raft attackers | Covering the weak side | Harpoon Gun, Bubble Wand, Repair Hammer |
| **Orbit** | No target; hits what it touches | Pure movement pathing | Anchor Flail, Crab Claw, Sawfish Blade |
| **Summon** | Autonomous helpers | Staying near the fight that matters | Seagull Bell, Parrot Perch, Ghost Crew Whistle |
| **Trail** | Leaves hazards where you walk | Movement pathing/kiting | Leaky Bucket, Oil Jar, Seaweed Boots |
| **Trap** | Auto-places hazards near you | Standing where enemies will be | Crab Trap, Banana Peel, Spike Buoy |

MVP ships one weapon from three different categories (§12); every category
gets at least two entries post-MVP.

### 7.4 MVP weapon specs

**Cutlass** (nearest-target, melee)

```text
Target:  nearest enemy in melee range
Attack:  90° slash arc, hits everything in the arc
Skill:   position so one slash hits multiple enemies
```

**Harpoon Gun** (defensive-target, ranged)

```text
Target:  enemies attacking raft tiles, else nearest
Attack:  single harpoon projectile
Effect:  pulls small enemies to the wielder; slows large ones
Skill:   stand so pulled enemies get dragged through cannon fire / allies' arcs
```

**Coconut Launcher** (cluster-target, ranged AoE)

```text
Target:  densest enemy cluster in range
Attack:  lobbed projectile, area explosion
Skill:   kite enemies into groups before the lob lands
```

These three teach the three core reads: *stand well* (Cutlass), *protect the
raft* (Harpoon), *herd the swarm* (Coconut).

### 7.5 Post-MVP weapon sketches

Frying Pan (knockback arc — bodyguard the broken tile), Lightning Rod (chains
between wet enemies; synergizes with rain weather and water weapons), Bubble
Wand (traps the enemy nearest the core), Anchor Flail (orbit), Crab Claw
(stuns highest-HP enemy in melee — tank-diving), Seagull Bell (dive-bombing
summons), Bottle Rockets (random-target explosions — luck builds), Leaky
Bucket (wet trail that enables lightning), Crab Trap (auto-placed snares).

## 8. Characters

Each character = starting weapon + passive trait + **automatic** special + stat
profile. No active abilities, no buttons.

| Character | Weapon | Passive | Automatic special |
| --- | --- | --- | --- |
| **Captain** | Cutlass | Nearby teammates gain attack speed | Every 12s, marks the most dangerous nearby enemy; marked enemies take bonus damage from everyone |
| **Carpenter** | Repair Hammer | Repairs faster | Standing near a damaged tile emits small auto-repair pulses (E still repairs faster manually) |
| **Cook** | Frying Pan | Food pickups heal more | Every 15s, drops a small meal near the most injured teammate |
| **Fisher** | Harpoon Gun | Bigger pickup radius | Own harpoon-tag weapons get the `attacking_raft` priority — the raft-defense specialist |
| **Storm Witch** | Lightning Rod | Lightning chains farther in rain | Every few seconds, lightning strikes a random wet enemy, else the nearest elite |
| **Goblin Stowaway** | Junk Launcher | +Luck, more random drops | Randomly hurls junk at nearby enemies; junk may explode, bounce, stun, or drop coins |

**MVP characters: Captain and Fisher** — a damage-amp aura and a raft-defense
kit make the co-op roles legible with zero extra systems (Carpenter/Cook need
food/repair-pulse systems; Storm Witch needs weather; Goblin needs the junk
table). The other four are Phase 5 content.

## 9. Enemies

All enemies come from the water. Archetypes exist to create *positioning
questions*, since there's no aiming to test.

### MVP roster (4 + boss)

| Enemy | Archetype | Behavior | The question it asks |
| --- | --- | --- | --- |
| **Chum** | Swarmer | Fast, weak, melee; targets nearest player | "Do I kite this pack through the cannon lane?" |
| **Spitter Crab** | Ranged | Sits at the water's edge, lobs globs at players *and* tiles | "Do I cross the raft to get my melee range on it?" |
| **Plank-Biter** | Objective attacker | Ignores players entirely, chews deck tiles edge-in | "Who breaks off from the swarm to deal with it?" (Harpoon Gun's favorite food) |
| **Brute Turtle** | Tank / elite | Slow, high HP, smashes tiles and players; light knockback aura | "Do we burn it down or keep kiting it away from the core?" |
| **The Kraken** (boss, wave 8) | Multi-point siege | Tentacles rise at 3–4 raft edges at once and squeeze tiles; head surfaces periodically as a burst-damage window; spawns Chum between phases | Forces the team to split, protect sides, and time repairs — the whole game in one fight |

### Post-MVP archetype buckets

Leaper (jumps onto the deck center — punishes turtling), Coin Thief (grabs
loot and flees — greed test), Bloater (explodes on death — don't melee it),
Screamer (buffs nearby enemies — priority target for `boss_or_elite` weapons),
weather-synced variants (wet enemies for lightning builds).

## 10. Waves, Difficulty, Scaling

- **8 waves per run (MVP).** Wave length ramps 30s → 75s. Wave 4 introduces
  the Brute Turtle as a mini-spike; wave 8 is the Kraken.
- Spawns are **budget-based**: each wave has a point budget spent on a weighted
  enemy table; spawn direction alternates and occasionally surges one side
  (creates the "protect the weak side" moments).
- **Player-count scaling:** enemy count and HP scale per player (~+70% budget,
  +30% HP per extra player); salvage and coin drops scale too. Solo must be
  survivable for dev/testing; 2p is the tuning target.
- **Difficulty settings (post-MVP):** "Calm Seas" (family: slower enemies,
  longer bleed-out, cheaper repairs) and "Storm" (harder). MVP ships one tuned
  default.

## 11. Economy & Shop

Two currencies with two owners — this is the co-op backbone:

- **Coins (personal):** drop from enemies, auto-collected in pickup radius.
  Spent in the personal shop on weapons and items. Your coins, your build.
- **Salvage (shared):** drops from raft-attacker enemies, floating crates, and
  wave-clear bonuses. Spent from a team pool on deck tiles, tile rebuilds, and
  modules. Team salvage, team argument — that's the fun.

**Shop (build phase):** 4 personal item/weapon offers per player, Brotato-style
reroll (escalating cost) and lock. Prices scale with wave number. No in-wave
XP/level-ups in MVP — the shop is the only progression valve (one system, not
two, and it keeps build phase decisions meaty).

**Loot greed:** some pickups bob in the water near the raft edge — grabbing
them means standing where it's dangerous. That's intentional (risk/reward
without aiming).

## 12. MVP Scope (locked)

```text
2-player online co-op (solo works for dev)
fully automatic weapons, keyboard-only combat
1 raft (5×5 start), deck-tile placement, tile damage/holes/repair
2 modules: Cannon, Repair Station
3 weapons: Cutlass, Harpoon Gun, Coconut Launcher
2 characters: Captain, Fisher
4 enemies + Kraken boss
8 waves, budget-based spawns
personal coins + shop (buy/reroll/lock); shared salvage + raft build
downed/revive, wave-end return
victory/defeat screen with run stats
ping, scoreboard
```

In-wave player verbs, complete list: **move, dash, repair, revive, collect
loot, ping.** Nothing else.

### Explicitly cut from MVP

Weather, the other 4 characters, weapon upgrade tiers (shop sells new copies
only; stacking = power), module rotation, meta-progression/unlocks, 3–4
player support, gamepad, sound design beyond placeholder, coin thief/greed
enemies, swimming/off-raft movement (players stay on the raft; loot bobs
within E-reach of the edge).

## 13. Skill Expression Checklist

Every system must map to at least one of these:

```text
movement / spacing / kiting routes
enemy grouping (for cluster weapons)
protecting weak raft sides
repair timing under pressure
reviving under pressure
greed decisions (edge loot vs safety)
shop choices & weapon synergy
team raft layout
standing near the right module/teammate
luring enemies through cannons, orbits, traps, trails
```

And must **not** rely on any of these:

```text
precision aiming, manual firing, skill shots
animation canceling, combos, rapid hotkeys
reaction-time checks tighter than ~0.5s
```

## 14. Family-Friendly Notes

- Cartoon-nautical art, no gore — enemies pop into bubbles/bones/coins.
- Failure is soft: downed → revived; wave-out → back next wave; defeat screen
  celebrates stats ("You repaired 34 tiles!") not blame.
- Readability first: enemy silhouettes distinct at a glance, raft damage
  states obvious, warning telegraphs generous (≥0.75s).
- Short runs (20–30 min), pause in solo, no time pressure in build phase
  beyond the skippable timer.

## 15. Open Design Questions (decide during Phase 1–2 playtests)

1. Does dash need i-frames or is speed-only enough? (Start without.)
2. Is 45s build phase right, or should early waves have shorter shops?
3. Shared salvage: pure honor system, or does buying need a second player's
   confirm above some cost? (Start honor-system; revisit if griefing shows up
   in public lobbies — for friends/family it's fine.)
4. Should broken *edge* tiles wash away permanently after N waves (raft
   erosion pressure) or always be repairable? (Start: always repairable.)
5. Coconut Launcher self-knockback? (No damage to players ever, but a little
   bounce might be fun. Test it.)

---

## Appendix A — Deltas from the original draft (what changed and why)

The revised auto-combat direction is adopted wholesale as pillar #1. On top of
it, this document adds/changes:

1. **Downed/revive/defeat rules defined** (§5) — the draft listed "revive" as
   a verb but had no death model. Chosen model is maximally family-friendly.
2. **Raft damage model defined** (§6) — tile HP, holes, shrinking safe area,
   core HP, edge-in erosion. This is the game's difficulty curve and defeat
   spiral; it needed hard numbers to prototype against.
3. **Two-currency economy** (§11) — personal coins vs shared salvage cleanly
   separates "my build" from "our raft" and avoids co-op shop fights.
4. **MVP tightened:** 2 characters (Captain, Fisher) added to the MVP list —
   the draft's MVP had weapons but silently implied characters; Repair
   Station added as second module so the repair loop has a build expression;
   no XP levels (shop-only progression, one system instead of two).
5. **Enemy roster made concrete** (§9) with one archetype per positioning
   question, and the boss designed as a multi-side siege (tests everything
   the game teaches, needs no aiming to fight).
6. **Wave scaling rules** (§10) — budget-based spawning and per-player-count
   scaling were unspecified.
7. **Carpenter/Cook/Storm Witch/Goblin deferred to Phase 5** — each drags in
   a whole system (repair pulses, food, weather, junk tables). Captain +
   Fisher demo the design (aura support + raft defense) with zero new systems.
8. **Players can't leave the raft in MVP** — swimming is a movement system,
   a camera problem, and a balance problem; edge-bobbing loot preserves the
   greed decision without it.
9. **Ping made contextual** (§4) — one button, meaning resolved by target,
   instead of a ping menu (menus during combat violate the keyboard-only
   spirit).
