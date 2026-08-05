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
  "/games/tower",
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

      /*
        The single most common responsive defect, checked on every capture.

        This tries to scroll the page sideways rather than comparing
        `scrollWidth` to `clientWidth`. With `overflow-x: clip` on the body,
        `scrollWidth` still reports the pre-clip extent, so a deliberately
        scrollable strip inside the page — the games nav, a wide table — reads
        as a whole-page overflow when nothing actually moves. What matters to
        someone holding a phone is whether the page shifts under their thumb.
      */
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const before = window.scrollX;
        window.scrollTo(9999, window.scrollY);
        const moved = window.scrollX;
        window.scrollTo(before, window.scrollY);

        return {
          moved,
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          offenders: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((el) => {
              if (el.getBoundingClientRect().right <= doc.clientWidth + 1) return false;
              // Ignore anything already inside a scroll or clip container.
              let parent = el.parentElement;
              while (parent) {
                const overflowX = getComputedStyle(parent).overflowX;
                if (overflowX !== "visible") return false;
                parent = parent.parentElement;
              }
              return true;
            })
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)}`),
        };
      });

      if (overflow.moved > 0) {
        problems.push(
          `${route} @${viewport.name} → page scrolls sideways by ${overflow.moved}px :: ${overflow.offenders.join(" | ")}`,
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
