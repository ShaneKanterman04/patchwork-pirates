# Patchwork Pirates — Execution Model (Opus overseer + Codex workers)

How the ROADMAP gets built. Three roles:

| Role | Who | Responsibilities |
| --- | --- | --- |
| **Product owner** | Shane | Approves phase transitions, design changes to the GDD, and merges. Plays the builds. |
| **Overseer** | Claude **Opus** (interactive Claude Code session in this repo) | Decomposes the current roadmap phase into work packets, briefs workers, reviews every diff, runs gates, integrates, commits to the work branch, updates statuses, escalates design questions to Shane. **Writes little or no product code itself.** |
| **Workers** | **Codex `gpt-5.5-codex` @ medium** (non-interactive `codex exec` runs) | Implement exactly one packet each: code + tests inside the packet's file scope, self-validate, report. |

## Prerequisites (one-time, overseer does this first)

1. `git init` the repo, initial commit of `docs/` + workspace scaffolding, create
   work branch `phase-0`. (Codex refuses to run outside a git repo — good.)
2. Verify `codex --version` works and the pnpm workspace scaffolding exists
   (Phase 0 deliverable #1 is itself the first worker packet).

## Worker invocation (canonical command)

```bash
codex exec \
  -m gpt-5.5-codex -c model_reasoning_effort=medium \
  -C /home/shane/projects/patchwork-pirates \
  -s workspace-write \
  -o "$SCRATCH/worker-<packet-id>-report.md" \
  --ephemeral \
  "$(cat "$SCRATCH/worker-<packet-id>-brief.md")"
```

- `-s workspace-write`: workers may edit the repo and run builds/tests, nothing
  outside it. Never use `--dangerously-bypass-approvals-and-sandbox`.
- `-o` captures the worker's final report for overseer review; the diff is
  reviewed from `git diff`, never trusted from the report.
- Overseer runs workers **in parallel only when their file scopes are disjoint
  packages** (e.g. `packages/content` + `packages/client`); otherwise
  sequential. `sim` and `protocol` changes are always sequential — they're the
  contract layers.

## Work packet (brief) format

The overseer writes each brief to a scratch file before launching. Template:

```markdown
# Packet <phase>.<n>: <title>
## Goal
One sentence. What exists after this packet that didn't before.
## File scope
You may create/modify ONLY: <paths>. Everything else is read-only context.
## Context to read first
docs/GDD.md §<x>, docs/TECH.md §<y>, <existing files>.
## Requirements
- <numbered, testable requirements — the overseer's acceptance list>
## Hard rules (repeat in every brief)
- packages/sim: pure TS, no Date.now()/Math.random()/DOM/Node imports — use the
  seeded PRNG on world state. Content is data in packages/content; if a new
  weapon/enemy needs an `if` in world.ts, add a primitive instead and say so.
- Wire shapes only change in packages/protocol, additively.
- Do not touch docs/, do not commit, do not install new dependencies without
  listing them in your report.
## Validation you must run before finishing
pnpm typecheck && pnpm lint && pnpm test   (plus packet-specific commands)
## Report format
What you built, decisions made, deps added, validation output (paste), open
concerns. Your final message is the report.
```

## Overseer loop (per packet)

```text
1. Write brief → launch worker → wait.
2. Review: git diff against the brief's file scope (scope violation = revert +
   re-brief), read the report, check requirements one by one.
3. Re-run gates YOURSELF (never trust the report's paste):
   pnpm typecheck && pnpm lint && pnpm test
4. Pass → git commit on the work branch: "packet 0.3: cutlass targeting (codex)".
   Fail → one retry with a sharpened brief quoting the failure. A packet that
   fails twice comes back to the overseer: fix it yourself if small, re-scope
   it if not. Never loop a worker a third time on the same brief.
5. Update docs/ROADMAP.md status markers; note deviations from GDD/TECH in the
   commit message.
```

## Escalation to Shane (stop and ask; do not decide unilaterally)

- Any change to a GDD **hard rule** (§2 banned inputs list) or MVP scope (§12).
- Any TECH.md one-way door (stack swap, protocol redesign, adding persistence).
- Phase exit: Shane plays the build and approves before the next phase starts —
  phase exit criteria are observational on purpose; the overseer cannot
  self-certify "it feels good".
- Merging/pushing the work branch. Overseer commits locally; Shane merges.

## Phase mapping (who does what per ROADMAP phase)

- **Packets ≈ deliverable bullets.** Each ROADMAP phase's bullet list is the
  starting packet decomposition; the overseer may split further but not merge
  bullets across packages into one mega-packet.
- **Phase 0 sizing:** ~5 packets (workspace scaffolding; sim loop + movement;
  cutlass + chum + targeting; server/WS + snapshots; client render + interp).
- **Overseer-only work (never delegated):** GDD/TECH/ROADMAP edits, packet
  decomposition, balance-number changes after Phase 3 harness runs, anything
  touching this file.
- **Worker-only work (never overseer):** rote implementation inside an
  established pattern (new content entries, new enemy on existing AI
  primitives, render polish).

## Kickoff (Shane runs this)

```bash
cd /home/shane/projects/patchwork-pirates
claude --model opus
```

First prompt:

> Read docs/EXECUTION.md, docs/ROADMAP.md, docs/TECH.md, docs/GDD.md. You are
> the overseer. Do the prerequisites, then decompose Phase 0 into packets and
> start executing with codex workers per EXECUTION.md. Stop at the Phase 0
> exit criterion for my playtest.
