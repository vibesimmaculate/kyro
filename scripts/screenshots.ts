/**
 * Visual inspection harness.
 *
 * Renders every route at the three viewports that decide the design and writes
 * them somewhere they can be looked at. This is not a test — it produces
 * evidence for a human (or an agent) to judge, which is the only way to catch
 * the things a passing assertion never will: bad wrapping, weak hierarchy,
 * spacing that reads as accidental.
 *
 *   pnpm shots                      all routes, all viewports
 *   pnpm shots -- /fees /help       just these
 *   OUT=... pnpm shots              somewhere else
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3000";

const OUT =
  process.env.OUT ??
  join(
    process.env.TEMP ?? "/tmp",
    "claude",
    "c--Users-kerim-kyro",
    "8c317070-4d20-4782-a08b-f84c3a06a8cf",
    "scratchpad",
    "shots",
  );

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
] as const;

const ROUTES = [
  "/",
  "/exchange",
  "/locations",
  "/locations/sarajevo-bascarsija",
  "/how-it-works",
  "/fees",
  "/help",
  "/track",
  "/games",
  "/games/coin-flip",
  "/games/fairness",
  "/sign-in",
];

function slug(route: string): string {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

/** Stops the countdown and any entrance animation from smearing a capture. */
async function settle(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
    }`,
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(350);
}

async function main() {
  const only = process.argv.slice(2).filter((a) => a.startsWith("/"));
  const routes = only.length > 0 ? only : ROUTES;

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const problems: string[] = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    for (const route of routes) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      if (status >= 400) {
        problems.push(`${route} @${viewport.name} → HTTP ${status}`);
      }
      await settle(page);

      // The single most common responsive defect, checked on every capture.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          offenders: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)}`),
        };
      });

      if (overflow.scrollWidth > overflow.clientWidth + 1) {
        problems.push(
          `${route} @${viewport.name} → horizontal overflow ${overflow.scrollWidth}>${overflow.clientWidth} :: ${overflow.offenders.join(" | ")}`,
        );
      }

      await page.screenshot({
        path: join(OUT, `${slug(route)}--${viewport.name}.png`),
        fullPage: true,
      });
      process.stdout.write(`  ${route} @${viewport.name}\n`);
    }

    await context.close();
  }

  await browser.close();

  console.log(`\nWritten to ${OUT}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exitCode = 1;
  } else {
    console.log("No overflow or error responses detected.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
