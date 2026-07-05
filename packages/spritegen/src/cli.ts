#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlas, buildContactSheet, checkDirectory, normalizeDirectory, writePromptFiles } from "./pipeline";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_RAW_DIR = join(REPO_ROOT, "art/sprites/raw");
const DEFAULT_NORMALIZED_DIR = join(REPO_ROOT, "art/sprites/normalized");
const DEFAULT_PROMPT_DIR = join(REPO_ROOT, "art/sprites/prompts");
const DEFAULT_REVIEW_PATH = join(REPO_ROOT, "art/sprites/review/contact-sheet.png");
const DEFAULT_ATLAS_DIR = join(REPO_ROOT, "packages/client/public/assets/sprites");

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);

  if (command === "prompt") {
    const outDir = options.out ?? DEFAULT_PROMPT_DIR;
    const written = await writePromptFiles(outDir);
    console.log(`Wrote ${written.length} prompt files to ${outDir}`);
    return;
  }

  if (command === "normalize") {
    const rawDir = options.raw ?? DEFAULT_RAW_DIR;
    const outDir = options.out ?? DEFAULT_NORMALIZED_DIR;
    const results = await normalizeDirectory(rawDir, outDir);
    console.log(`Normalized ${results.length} sprite frames to ${outDir}`);
    return;
  }

  if (command === "check") {
    const dir = options.dir ?? DEFAULT_NORMALIZED_DIR;
    const issues = await checkDirectory(dir);
    if (issues.length > 0) {
      for (const issue of issues) {
        console.error(`${issue.path}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`Sprite checks passed for ${dir}`);
    return;
  }

  if (command === "atlas") {
    const dir = options.dir ?? DEFAULT_NORMALIZED_DIR;
    const outDir = options.out ?? DEFAULT_ATLAS_DIR;
    await mkdir(outDir, { recursive: true });
    const manifest = await buildAtlas(dir, outDir);
    console.log(`Built ${Object.keys(manifest.frames).length} frames in ${outDir}`);
    return;
  }

  if (command === "contact-sheet") {
    const dir = options.dir ?? DEFAULT_NORMALIZED_DIR;
    const out = options.out ?? DEFAULT_REVIEW_PATH;
    await mkdir(dirname(out), { recursive: true });
    await buildContactSheet(dir, out);
    console.log(`Wrote ${out}`);
    return;
  }

  usage();
  process.exitCode = command === undefined ? 0 : 1;
}

function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }

  return options;
}

function usage(): void {
  console.log(`Usage: patchwork-spritegen <command> [options]

Commands:
  prompt [--out DIR]              Write Codex image-generation prompts.
  normalize [--raw DIR --out DIR] Convert raw chroma PNGs into 128px sprite cells.
  check [--dir DIR]               Validate normalized sprite cells.
  atlas [--dir DIR --out DIR]     Build Pixi-ready spritesheet.png and spritesheet.json.
  contact-sheet [--dir DIR --out PNG]
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
