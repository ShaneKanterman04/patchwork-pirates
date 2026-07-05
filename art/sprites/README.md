# Sprite Pipeline

This directory stores the versioned inputs and review artifacts for Codex-generated sprites.

Workflow:

1. `pnpm sprites:prompt` writes the locked prompts to `art/sprites/prompts/`.
2. Use Codex image generation with those prompts and save selected raw PNGs to `art/sprites/raw/<asset-id>/idle.png`.
3. `pnpm sprites:normalize` converts raw chroma-key PNGs into fixed `128x128` transparent cells.
4. `pnpm sprites:check` validates sizing and margins.
5. `pnpm sprites:review` creates a contact sheet with grid overlays.
6. `pnpm sprites:atlas` writes the client-ready atlas to `packages/client/public/assets/sprites/`.

Animation prompts are generated alongside static prompts. Save optional animation frames with the same names as their prompt files, for example `art/sprites/raw/captain/walk_0.png`. The atlas includes an animation only when every frame in that animation exists and passes the shared bounds checks; otherwise the client falls back to the static `idle` frame.

The game client falls back to procedural drawing whenever the atlas is missing or incomplete.
