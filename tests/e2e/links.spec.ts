import { expect, test } from "@playwright/test";

/**
 * Every internal link resolves.
 *
 * This exists because the footer linked to `/terms` and `/privacy` on every
 * page of the site, and neither route had ever been created. Both 404ed from
 * the moment the footer shipped, including from the middle of the exchange
 * flow, which is exactly where somebody stops to check what they are agreeing
 * to. Nothing caught it: the pages that *do* exist were all tested, and a link
 * to a page that does not exist is invisible to a test suite that only visits
 * pages it already knows about.
 *
 * So this walks outward from the entry points, collects every same-origin href
 * it finds, and asks the server for each one. It is deliberately a crawl rather
 * than a list, because a list has the same blind spot as the tests it replaces.
 */

const ENTRY_POINTS = ["/", "/exchange", "/prices", "/locations", "/help", "/games"];

/** Routes that legitimately answer something other than 200 to a bare GET. */
const EXPECTED_NON_200 = new Set<string>([
  // Requires a signed-in staff session.
  "/operator",
]);

test.describe("links", () => {
  test("no internal link anywhere on the site 404s", async ({ page, request }) => {
    const found = new Set<string>();

    for (const entry of ENTRY_POINTS) {
      const response = await page.goto(entry);
      expect(response?.status(), `${entry} did not load`).toBeLessThan(400);

      const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href") ?? "")
          // Same-origin paths only: no mailto, no tel, no external, no anchors.
          .filter((href) => href.startsWith("/") && !href.startsWith("//")),
      );

      for (const href of hrefs) {
        // Drop the fragment; `/help#contact` and `/help` are the same document.
        const path = href.split("#")[0] ?? "";
        if (path) found.add(path);
      }
    }

    expect(found.size, "crawl found no links at all").toBeGreaterThan(10);

    const broken: string[] = [];
    for (const path of found) {
      if (EXPECTED_NON_200.has(path.split("?")[0] ?? path)) continue;
      const response = await request.get(path, { maxRedirects: 5 });
      if (response.status() >= 400) broken.push(`${path} → ${response.status()}`);
    }

    expect(broken, "internal links that do not resolve").toEqual([]);
  });
});
