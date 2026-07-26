# Patchwork Pirates

> **Brotato on a breakable raft, but co-op.**

A co-op auto-combat survival roguelite. Players move, dodge, repair, and build a
shared raft while their weapons automatically fight off waves of sea monsters.
No aiming, no attack button — keyboard-only combat, family-friendly by design.

## Docs

| Doc | What it is |
| --- | --- |
| [`docs/GDD.md`](docs/GDD.md) | Full game design: hard rules, combat/targeting, characters, weapons, raft, enemies, economy, MVP scope |
| [`docs/TECH.md`](docs/TECH.md) | Stack, server-authoritative sim architecture, netcode, project layout |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased plan (Phase 0–6) with deliverables and exit criteria per phase |
| [`docs/EXECUTION.md`](docs/EXECUTION.md) | Operating model: Opus overseer orchestrating Codex (`gpt-5.5-codex` @ medium) worker agents |

## The one hard rule

During waves the player controls **movement, dash, interact (repair/revive/loot),
ping, and nothing else**. All weapons, modules, and character specials act
automatically. Player skill = positioning, kiting, triage, and build choices —
never aiming. Any feature that needs a mouse during combat is out of scope by
definition.

## Status

Pre-production. No code yet — start at `docs/ROADMAP.md` Phase 0.

## GitHub CI runner

Validation uses the `homelab` micro tier. ARC manages when an ephemeral runner
pod exists; that runner executes the browser validation and is deleted after
the job. Keep it micro unless profiling shows sustained CPU demand that
justifies `homelab-heavy`. The platform contract is in the
[KanterLabs runner runbook](https://github.com/KanterLabs/infrastructure/tree/main/homelab/ci-runners).
# patchwork-pirates
