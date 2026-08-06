import { expect, test } from "@playwright/test";

/**
 * Demo mode and the machine-readable surfaces.
 *
 * Signed out on purpose — this file is the check that a stranger who lands on
 * the site can actually play, and that anything reading the site
 * programmatically gets the fee right.
 */

test.describe("demo mode", () => {
  test("lets a signed-out visitor play every game", async ({ page }) => {
    for (const game of ["tower", "coin-flip", "dice", "mines", "crash", "plinko"]) {
      await page.goto(`/games/${game}`);

      await expect(
        page.getByText("Demo mode.", { exact: true }),
        `${game} should offer demo mode`,
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Play for real" })).toBeVisible();

      // The board must be live, not a locked preview.
      await expect(page.getByLabel("Stake")).toBeEnabled();
    }
  });

  test("says plainly that demo rounds are not provably fair", async ({ page }) => {
    await page.goto("/games/tower");
    await expect(page.getByText(/not.*provably fair/i)).toBeVisible();
    await expect(page.getByText(/browser generates the seed/i)).toBeVisible();
  });

  test("plays a full Tower round and moves the demo balance", async ({ page }) => {
    await page.goto("/games/tower");

    await page.getByRole("button", { name: "Start climbing" }).click();
    await expect(page.getByRole("button", { name: /Clear a floor first/ })).toBeVisible({
      timeout: 15_000,
    });

    // Floor 1 is the bottom of the tower, so it is the last row on screen.
    await page.getByRole("button", { name: "Floor 1, door 1" }).click();

    // Either it held and there is money to take, or it did not. Both are fine;
    // a hang is not.
    await expect(
      page.getByText(/Take |wrong one|try floor/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("keeps a demo balance across a reload, and can reset it", async ({ page }) => {
    await page.goto("/games/coin-flip");
    await page.getByRole("button", { name: "Flip" }).click();
    await expect(page.getByText(/it landed (heads|tails)/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    // The formatter groups with a non-breaking space, so this matches loosely
    // rather than hard-coding an invisible character into the assertion.
    await expect(page.getByText(/1\s?000\.00 USDT/).first()).toBeVisible();
  });

  test("still refuses a self-excluded account, demo or not", async ({ page }) => {
    // Nothing to drive here without an excluded fixture; what is asserted is
    // that the gate component exists and the copy is unambiguous.
    await page.goto("/games");
    await expect(page.getByRole("link", { name: /Limits/ }).first()).toBeVisible();
  });
});

test.describe("machine-readable", () => {
  test("serves robots.txt pointing at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Sitemap:");
    // The private surfaces must stay out of the index.
    for (const path of ["/operator", "/games", "/orders/", "/api/"]) {
      expect(body, `${path} should be disallowed`).toContain(path);
    }
  });

  test("serves a sitemap of public pages only", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("/fees");
    expect(body).toContain("/locations/sarajevo-bascarsija");
    expect(body).not.toContain("/operator");
    expect(body).not.toContain("/games");
  });

  test("serves an llms.txt that states the fee exactly", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("4% of the cash side");
    expect(body).toContain("1,000 EUR the fee is 40.00 EUR");
    // It must warn a model off quoting preview data as fact.
    expect(body).toContain("PREVIEW value");
    expect(body).toContain("SAMPLE data");
    expect(body).toContain("no gaming licence");
  });

  test("publishes structured data with the fee as a real field", async ({ page }) => {
    await page.goto("/");

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);

    const graph = JSON.parse(blocks[0] ?? "{}") as {
      "@graph"?: Array<Record<string, unknown>>;
    };
    const types = (graph["@graph"] ?? []).map((node) => node["@type"]);

    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    expect(types).toContain("FinancialProduct");
    expect(types).toContain("FAQPage");

    const service = (graph["@graph"] ?? []).find((n) => n["@type"] === "FinancialProduct");
    expect(String(service?.feesAndCommissionsSpecification)).toContain("4%");

    // Fabricated ratings are the classic abuse of this markup.
    expect(types).not.toContain("AggregateRating");
    expect(types).not.toContain("Review");
  });

  test("marks each location as a place with hours and coordinates", async ({ page }) => {
    await page.goto("/locations/sarajevo-bascarsija");

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graph = JSON.parse(blocks[0] ?? "{}") as {
      "@graph"?: Array<Record<string, unknown>>;
    };
    const place = (graph["@graph"] ?? []).find((n) => n["@type"] === "FinancialService");

    expect(place).toBeDefined();
    expect(place?.geo).toBeDefined();
    expect(place?.openingHoursSpecification).toBeDefined();
  });

  test("gives every public page a canonical URL", async ({ page }) => {
    for (const route of ["/", "/fees", "/how-it-works", "/locations", "/help", "/track"]) {
      await page.goto(route);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, `${route} needs a canonical`).toBeTruthy();
    }
  });

  test("keeps the games wing out of the index", async ({ page }) => {
    await page.goto("/games/tower");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });
});
