import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { Browser, BrowserContext, ConsoleMessage, Page } from "playwright";

export interface ConsoleEntry {
  type: string;
  text: string;
}

export interface BrowserHarness {
  browser: Browser;
  context: BrowserContext;
  pages: Page[];
  entries: ConsoleEntry[];
  screenshot: (page: Page, outDir: string, label: string) => Promise<string>;
  flushConsole: (outDir: string) => Promise<ConsoleEntry[]>;
  close: () => Promise<void>;
}

export async function launchBrowser(pageCount: number, headed = false): Promise<BrowserHarness> {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const entries: ConsoleEntry[] = [];
  const pages: Page[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const page = await context.newPage();
    attachCollectors(page, entries);
    pages.push(page);
  }

  return {
    browser,
    context,
    pages,
    entries,
    screenshot,
    flushConsole: async (outDir: string) => {
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "console.json"), JSON.stringify(entries, null, 2));
      return entries;
    },
    close: async () => {
      await context.close();
      await browser.close();
    }
  };
}

export async function screenshot(page: Page, outDir: string, label: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  const file = await stat(filePath);
  if (file.size <= 0) {
    throw new Error(`Screenshot ${label} was empty.`);
  }
  return filePath;
}

function attachCollectors(page: Page, entries: ConsoleEntry[]): void {
  page.on("console", (message: ConsoleMessage) => {
    entries.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    entries.push({ type: "pageerror", text: error.message });
  });
}
