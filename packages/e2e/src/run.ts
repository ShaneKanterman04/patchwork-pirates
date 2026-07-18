import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { launchBrowser } from "./browser";
import { launchTestServer } from "./server";
import { scenarios } from "./scenarios";
import type { Scenario, ScenarioStep } from "./scenarios";

interface Result {
  pass: boolean;
  scenario: string;
  errors: string[];
  screenshotPaths: string[];
}

interface ChildHandle {
  process: ReturnType<typeof spawn>;
  stop: () => Promise<void>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(e2eRoot, "../..");
const clientRoot = path.join(repoRoot, "packages/client");
const clientPort = 5199;
const serverPort = 8199;

const args = process.argv.slice(2);
const scenarioName = args.find((arg) => !arg.startsWith("--"));
const headed = args.includes("--headed");

if (scenarioName === undefined) {
  console.error("Usage: tsx src/run.ts <scenarioName> [--headed]");
  process.exit(1);
}

const scenario = scenarios.get(scenarioName);
if (scenario === undefined) {
  console.error(`Unknown scenario "${scenarioName}". Known: ${[...scenarios.keys()].join(", ")}`);
  process.exit(1);
}

const outDir = path.join(e2eRoot, "out", scenario.name);
const result: Result = {
  pass: false,
  scenario: scenario.name,
  errors: [],
  screenshotPaths: []
};

let clientServer: ChildHandle | undefined;
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
let testServer: ReturnType<typeof launchTestServer> | undefined;

try {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  clientServer = await startClientPreviewServer();
  testServer = launchTestServer(scenario.seed, serverPort);
  browser = await launchBrowser(scenario.players.length, headed);

  const pageUrl = `http://localhost:${clientPort}/?port=${serverPort}&resethints=1`;
  await Promise.all(browser.pages.map((page) => page.goto(pageUrl, { waitUntil: "domcontentloaded" })));
  await Promise.all(browser.pages.map(async (page) => {
    await page.waitForSelector("canvas.game-canvas", { state: "visible", timeout: 15_000 });
    await page.waitForSelector("[data-lobby] .lobby-actions", { state: "visible", timeout: 10_000 });
  }));

  await runScenario(scenario, browser.pages, outDir, async (page, label) => {
    const filePath = await browser!.screenshot(page, outDir, label);
    result.screenshotPaths.push(path.relative(repoRoot, filePath));
  });

  const consoleEntries = await browser.flushConsole(outDir);
  for (const entry of consoleEntries) {
    if (entry.type === "error" || entry.type === "pageerror") {
      result.errors.push(`${entry.type}: ${entry.text}`);
    }
  }

  for (const screenshotPath of result.screenshotPaths) {
    const fullPath = path.join(repoRoot, screenshotPath);
    const screenshotStat = await stat(fullPath);
    if (screenshotStat.size <= 0) {
      result.errors.push(`Screenshot ${screenshotPath} has zero size.`);
    }
  }

  result.pass = result.errors.length === 0;
} catch (error) {
  result.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  if (browser !== undefined) {
    await browser.flushConsole(outDir).catch((error: unknown) => {
      result.errors.push(`console flush failed: ${String(error)}`);
    });
  }
  if (browser !== undefined) {
    await browser.close().catch((error: unknown) => {
      result.errors.push(`browser close failed: ${String(error)}`);
    });
  }
  if (testServer !== undefined) {
    await testServer.close().catch((error: unknown) => {
      result.errors.push(`test server close failed: ${String(error)}`);
    });
  }
  if (clientServer !== undefined) {
    await clientServer.stop().catch((error: unknown) => {
      result.errors.push(`preview server close failed: ${String(error)}`);
    });
  }

  result.pass = result.errors.length === 0;
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
}

process.exit(result.pass ? 0 : 1);

async function runScenario(
  activeScenario: Scenario,
  pages: Page[],
  scenarioOutDir: string,
  capture: (page: Page, label: string) => Promise<void>
): Promise<void> {
  for (const [index, player] of activeScenario.players.entries()) {
    if (player.characterId !== undefined) {
      await pages[index]!.evaluate((characterId) => {
        window.localStorage.setItem("patchwork.e2e.characterId", characterId);
      }, player.characterId);
    }
  }

  for (const step of activeScenario.steps) {
    await runStep(step, pages, scenarioOutDir, capture);

    if (activeScenario.name === "coop-smoke" && isCreateLobbyStep(step)) {
      await joinSecondPageFromFirstLobby(pages[0]!, pages[1]!);
    }
  }
}

async function runStep(
  step: ScenarioStep,
  pages: Page[],
  _scenarioOutDir: string,
  capture: (page: Page, label: string) => Promise<void>
): Promise<void> {
  const pageIndex = stepPageIndex(step);
  const page = pages[pageIndex];
  if (page === undefined) {
    throw new Error(`Step references missing page ${pageIndex}.`);
  }

  if ("wait" in step) {
    await page.waitForTimeout(step.wait);
    return;
  }

  if ("key" in step) {
    await page.keyboard.down(step.key);
    await page.waitForTimeout(step.downMs ?? 100);
    await page.keyboard.up(step.key);
    return;
  }

  if ("click" in step) {
    await page.waitForSelector(step.click, { state: "visible", timeout: 10_000 });
    await page.click(step.click);
    return;
  }

  await capture(page, step.screenshot);
}

async function joinSecondPageFromFirstLobby(firstPage: Page, secondPage: Page): Promise<void> {
  const code = await firstPage.locator("[data-lobby] .lobby-code").textContent({ timeout: 10_000 });
  if (code === null || code.trim().length === 0) {
    throw new Error("Could not read lobby code from first page.");
  }

  await secondPage.waitForSelector("[data-lobby] input", { state: "visible", timeout: 10_000 });
  await secondPage.fill("[data-lobby] input", code.trim());
  await secondPage.click("[data-lobby] .lobby-actions button:nth-of-type(2)");
  await secondPage.waitForSelector("[data-lobby] .lobby-code", { state: "visible", timeout: 10_000 });
  await firstPage.waitForFunction(() => document.querySelectorAll("[data-lobby] .roster-player").length >= 2);
  await secondPage.waitForFunction(() => document.querySelectorAll("[data-lobby] .roster-player").length >= 2);
}

function isCreateLobbyStep(step: ScenarioStep): boolean {
  return "click" in step && step.page === 0 && step.click.includes(".lobby-actions button:first-of-type");
}

function stepPageIndex(step: ScenarioStep): number {
  if ("click" in step || "key" in step || "screenshot" in step) {
    return step.page ?? 0;
  }
  return 0;
}

async function startClientPreviewServer(): Promise<ChildHandle> {
  // Browser acceptance must exercise the exact Rollup output shipped to players.
  // A Vite development server serves an unbundled graph and cannot catch production-only
  // module evaluation deadlocks.
  await runCommand("pnpm", ["run", "build"], clientRoot);
  const child = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], {
    cwd: clientRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output += chunk;
  });

  await waitForHttp(`http://localhost:${clientPort}/`, 15_000, () => {
    if (child.exitCode !== null) {
      throw new Error(`vite preview server exited early:\n${output}`);
    }
  });

  return {
    process: child,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await waitForExit(child, 3_000).catch(async () => {
          await runCommand("fuser", ["-k", `${clientPort}/tcp`], repoRoot, true);
        });
      }
    }
  };
}

async function waitForHttp(url: string, timeoutMs: number, poll: () => void): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    poll();
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the preview server is ready or exits.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runCommand(
  command: string,
  commandArgs: string[],
  cwd: string,
  allowFailure = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || allowFailure) {
        resolve(output);
      } else {
        reject(new Error(`${command} ${commandArgs.join(" ")} failed with ${code}:\n${output}`));
      }
    });
  });
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for process exit.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
