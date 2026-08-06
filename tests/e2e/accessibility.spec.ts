import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility checks.
 *
 * Axe catches the mechanical failures — contrast, names, roles, landmarks — and
 * misses everything about whether the page is actually usable. So the keyboard
 * and focus behaviour is asserted separately below, by driving it.
 */

const PAGES = [
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

/**
 * Waits until the stylesheet has actually applied.
 *
 * Axe measures geometry, so running it against an unstyled page does not test
 * the page — it tests the raw document, where every link is its own text height
 * and the WCAG target-size rule fails on all of them at once. That produced a
 * spectacular twenty-six-node failure that had nothing to do with the site and
 * everything to do with a stylesheet that had not landed yet.
 *
 * The skip link is the probe: it is `sr-only`, so once the stylesheet is in
 * effect it collapses to roughly a pixel. If it still has the height of a line
 * of text, the CSS is not there.
 */
async function expectStyled(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const skip = document.querySelector("a[href='#main']");
          return skip ? Math.round(skip.getBoundingClientRect().height) : -1;
        }),
      { message: "stylesheet never applied, so axe would be measuring an unstyled page" },
    )
    .toBeLessThanOrEqual(2);

  // And until entrance animations have finished. Several figures on this site
  // fade in over about 180ms, and axe sampling one at 40% opacity reports a
  // contrast failure for text that is fully legible a fifth of a second later.
  // Infinite animations are excluded rather than waited on, for obvious
  // reasons.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document
            .getAnimations()
            .filter((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return timing !== undefined && Number.isFinite(timing.endTime ?? Infinity);
            })
            .some((animation) => animation.playState === "running"),
        ),
      { message: "entrance animations never settled" },
    )
    .toBe(false);
}

test.describe("accessibility", () => {
  for (const route of PAGES) {
    test(`${route} has no axe violations`, async ({ page }) => {
      await page.goto(route);
      await expectStyled(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      // Reported in full: a bare count tells whoever reads the failure nothing.
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
        first: v.nodes[0]?.html?.slice(0, 120),
      }));

      expect(summary, `${route} axe violations`).toEqual([]);
    });
  }

  test("every interactive control on the ticket is reachable by keyboard", async ({ page }) => {
    await page.goto("/");

    const reached: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      await page.keyboard.press("Tab");
      const described = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "";
        return (
          el.getAttribute("aria-label") ??
          el.getAttribute("id") ??
          el.textContent?.trim().slice(0, 30) ??
          el.tagName
        );
      });
      if (described) reached.push(described);
    }

    // The controls that actually decide the money must all be tabbable.
    const joined = reached.join(" | ");
    expect(joined).toMatch(/Cash → Crypto|direction/i);
    expect(joined).toMatch(/amount|You give/i);
    expect(joined).toMatch(/Continue/i);
  });

  test("shows a visible focus ring rather than relying on the browser default", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    expect(outline?.style).not.toBe("none");
    expect(Number.parseFloat(outline?.width ?? "0")).toBeGreaterThanOrEqual(2);
  });

  test("honours prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // Every animation is reduced to a nominal duration rather than merely
    // being shortened, so nothing moves for someone who asked it not to.
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => d && d !== "0s")
        .slice(0, 40),
    );

    for (const duration of durations) {
      expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
    }
  });
});
