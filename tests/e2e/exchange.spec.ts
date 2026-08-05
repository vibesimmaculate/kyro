import { expect, test } from "@playwright/test";

/**
 * The customer's whole journey: price it, work through the five steps, get a
 * code, then find the order again with only that code.
 */

test.describe("the exchange", () => {
  test("shows the 4% fee before anything is committed to", async ({ page }) => {
    await page.goto("/");

    // Scoped to the ticket: the worked example further down the page prints
    // the same figures, and an unscoped match would not prove the calculator
    // itself is right.
    const ticket = page.getByLabel("Exchange calculator");
    await expect(ticket).toBeVisible();

    await expect(ticket.getByText("Service fee 4%")).toBeVisible();
    // €1 000 default → exactly €40.00, printed rather than implied.
    await expect(ticket.getByText("40.00 EUR")).toBeVisible();
    await expect(ticket.getByText(/Preview rate/)).toBeVisible();
  });

  test("recomputes when the amount changes", async ({ page }) => {
    await page.goto("/");

    const ticket = page.getByLabel("Exchange calculator");
    const amount = page.getByLabel("You give");
    await amount.fill("2000");
    await amount.blur();

    await expect(ticket.getByText("80.00 EUR")).toBeVisible({ timeout: 10_000 });
  });

  test("swaps what the amount means when the direction changes", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("radio", { name: /Crypto → Cash/ }).click();
    await expect(page.getByText("You collect").first()).toBeVisible();
    await expect(
      page.getByText(/Charged by the network to your own wallet/).first(),
    ).toBeVisible();
  });

  test("carries an order through all five steps to a code", async ({ page }) => {
    await page.goto("/exchange");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/exchange\/details/, { timeout: 20_000 });

    await page.getByLabel("Email").fill("e2e@kyro.test");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/exchange\/wallet/, { timeout: 20_000 });

    // A testnet address, because the install runs in testnet mode. Handing it
    // a mainnet one is a different test — see below.
    await page
      .getByLabel(/Your BTC address/)
      .fill("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/exchange\/location/, { timeout: 20_000 });

    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/exchange\/review/, { timeout: 20_000 });

    await expect(page.getByText("Bring with you")).toBeVisible();
    await page.getByRole("button", { name: "Create this exchange" }).click();

    await expect(page).toHaveURL(/\/orders\/KYR-/, { timeout: 30_000 });
    await expect(page.getByText("Your exchange is ready.").first()).toBeVisible();

    const code = await page.locator("p.figure-num").first().innerText();
    expect(code).toMatch(/^KYR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // The code alone must be enough to find it again.
    await page.goto("/track");
    await page.getByLabel("Order code").fill(code);
    await page.getByRole("button", { name: "Find my order" }).click();
    await expect(page).toHaveURL(new RegExp(code), { timeout: 20_000 });
    await expect(page.getByText("Order created")).toBeVisible();
  });

  test("refuses an address that is malformed or on the wrong network", async ({ page }) => {
    await page.goto("/exchange");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Email").fill("e2e@kyro.test");
    await page.getByRole("button", { name: "Continue" }).click();

    const address = page.getByLabel(/Your BTC address/);

    await address.fill("bc1qinvalidaddressthatcannotwork");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/not a valid bitcoin address|checksum/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/exchange\/wallet/);

    // A perfectly valid mainnet address is still wrong on a testnet install,
    // and the message has to say which — "invalid address" would send someone
    // hunting for a typo that is not there.
    await address.fill("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/valid mainnet address.*testnet/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("says something useful when the amount is out of range", async ({ page }) => {
    await page.goto("/");
    const amount = page.getByLabel("You give");
    await amount.fill("5");
    await amount.blur();
    await expect(page.getByText(/The counter starts at/)).toBeVisible({ timeout: 10_000 });

    await amount.fill("999999");
    await amount.blur();
    await expect(page.getByText(/is the most one order can carry/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("tells someone with a bad code to look again, without confirming what exists", async ({
    page,
  }) => {
    await page.goto("/track");
    await page.getByLabel("Order code").fill("KYR-2222-2222");
    await page.getByRole("button", { name: "Find my order" }).click();
    await expect(page.getByText(/No order with that code/)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("responsive", () => {
  const widths = [360, 390, 768, 1024, 1440, 1920];

  for (const width of widths) {
    test(`never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      const routes = [
        "/",
        "/exchange",
        "/locations",
        "/fees",
        "/help",
        "/track",
        "/games",
        "/games/tower",
        "/games/mines",
      ];

      for (const route of routes) {
        await page.goto(route);

        // Asserts what a person actually experiences: try to drag the page
        // sideways and check it does not move. Comparing scrollWidth to
        // clientWidth reports a false positive whenever the page legitimately
        // contains a scrollable strip, because `overflow-x: clip` still
        // reports the pre-clip extent.
        const moved = await page.evaluate(() => {
          const before = window.scrollX;
          window.scrollTo(9999, window.scrollY);
          const after = window.scrollX;
          window.scrollTo(before, window.scrollY);
          return after;
        });

        expect(moved, `${route} at ${width}px scrolls sideways`).toBe(0);
      }
    });
  }

  test("opens a real menu on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Locations/ })).toBeVisible();

    // Escape closes it — the keyboard route matters as much as the tap.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
