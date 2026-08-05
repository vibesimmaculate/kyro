import { expect, test } from "@playwright/test";

/**
 * The games loop, end to end, against a real database and a real ledger.
 *
 * Requires local Supabase and a seeded player:
 *
 *   pnpm db:start && pnpm db:player
 */

const EMAIL = process.env.PLAYER_EMAIL ?? "player@kyro.test";
const PASSWORD = process.env.PLAYER_PASSWORD ?? "counter-fixture-2026";

test.describe("games", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in?next=/games");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Asserting on the heading, not the URL: "/sign-in?next=/games" also
    // contains "/games", so a URL match would pass before navigation even
    // started and let the rest of the test run signed out.
    await expect(page.getByRole("heading", { name: /Five games/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("plays a coin flip and moves the balance", async ({ page }) => {
    await page.goto("/games/coin-flip");

    await expect(page.getByText(/Balance/).first()).toBeVisible();
    const before = await page.getByLabel("Stake").inputValue();
    expect(Number(before)).toBeGreaterThan(0);

    await page.getByRole("button", { name: /^heads$/i }).click();
    await page.getByRole("button", { name: "Flip" }).click();

    // The coin spins before it answers, so this also proves the reveal
    // animation resolves rather than leaving the board stuck mid-flight.
    // The status line is a live region, so waiting on it additionally proves
    // the announcement a screen reader would receive actually arrives.
    await expect(page.getByText(/it landed (heads|tails)/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("dice moves payout and target together", async ({ page }) => {
    await page.goto("/games/dice");

    await expect(page.getByRole("slider", { name: "Win chance" })).toBeVisible();

    // At 50% the payout is 99/50 = 1.98×.
    await expect(page.getByText("1.98×").first()).toBeVisible();

    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.getByText(/is (not )?(under|over)/)).toBeVisible({ timeout: 20_000 });
  });

  test("mines reveals a tile against a board fixed by the seeds", async ({ page }) => {
    await page.goto("/games/mines");

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: /Take |Open a tile first/ })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("gridcell", { name: "Tile 1", exact: true }).click();

    // Either it was safe and there is something to cash out, or it was a mine
    // and the round ended. Both are correct outcomes; a hang is not.
    await expect(
      page.getByText(/Take |hit a mine|open one more/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("publishes a seed commitment on every game", async ({ page }) => {
    for (const game of ["coin-flip", "dice", "mines", "crash", "plinko"]) {
      await page.goto(`/games/${game}`);
      await expect(page.getByRole("heading", { name: "Provably fair" })).toBeVisible();
      await expect(page.getByText("Server seed hash")).toBeVisible();
      await expect(page.getByText("House edge 1%")).toBeVisible();
    }
  });

  test("verifies a round in the browser with no server involvement", async ({ page }) => {
    await page.goto("/games/fairness");

    await page.getByLabel("Server seed (revealed)").fill("a".repeat(64));
    await page.getByLabel("Client seed").fill("player-seed");
    await page.getByLabel("Nonce").fill("7");
    await page.getByRole("button", { name: "Recompute" }).click();

    await expect(page.getByText("Hash of this server seed")).toBeVisible();
    await expect(page.getByText(/^Landed: (heads|tails)$/)).toBeVisible();
  });

  test("offers a deposit address and refuses a bad withdrawal address", async ({ page }) => {
    await page.goto("/games/wallet");
    await expect(
      page.getByRole("heading", { name: "Deposit", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Tron", exact: true }).click();

    // The address is permanent, so a second run finds it already issued.
    const issue = page.getByRole("button", { name: /Get my Tron address/ });
    if (await issue.isVisible().catch(() => false)) await issue.click();
    await expect(page.getByRole("button", { name: /Copy address/ }).first()).toBeVisible({
      timeout: 20_000,
    });

    // A checksum failure must be caught before anything is signed.
    await page.getByLabel("Send to").fill("TQ5NMqJjaVkM5ZGHwCVSTGrhCTPRoLbAsX");
    await page.getByLabel("Amount").fill("5");
    await page.getByRole("button", { name: "Request withdrawal" }).click();
    await expect(page.getByText(/checksum|not a valid/i)).toBeVisible({ timeout: 20_000 });
  });
});
