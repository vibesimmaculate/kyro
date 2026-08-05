import { describe, expect, it } from "vitest";
import {
  floatStream,
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
  roundBytes,
  verifyCommitment,
} from "@/lib/fair";
import {
  COIN_FLIP_MULTIPLIER,
  HOUSE_EDGE_BP,
  MULTIPLIER_SCALE,
  PLINKO_MULTIPLIERS,
  PLINKO_ROWS,
  crashPoint,
  diceMultiplier,
  minesBoard,
  minesMultiplier,
  payoutFor,
  playCoinFlip,
  playDice,
  plinkoPath,
} from "@/lib/games";

const SERVER = "a".repeat(64);
const CLIENT = "player-seed";

/** The stated edge, as a return: 99%. */
const EXPECTED_RETURN = (10_000 - HOUSE_EDGE_BP) / 10_000;

describe("provable fairness", () => {
  it("commits before it reveals", () => {
    const serverSeed = generateServerSeed();
    const published = hashServerSeed(serverSeed);

    expect(published).toHaveLength(64);
    expect(verifyCommitment(serverSeed, published)).toBe(true);
    // A different seed cannot produce the published hash — which is the whole
    // guarantee. If this ever failed, the game would be unprovable.
    expect(verifyCommitment(generateServerSeed(), published)).toBe(false);
  });

  it("is deterministic: same seeds, same round, same answer", () => {
    const a = roundBytes(SERVER, CLIENT, 7);
    const b = roundBytes(SERVER, CLIENT, 7);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("gives a different answer for every nonce", () => {
    const seen = new Set<string>();
    for (let nonce = 0; nonce < 500; nonce += 1) {
      seen.add(roundBytes(SERVER, CLIENT, nonce).join(","));
    }
    expect(seen.size).toBe(500);
  });

  it("changes completely when the player changes their seed", () => {
    const mine = floatStream(SERVER, "mine", 1, 4);
    const yours = floatStream(SERVER, "yours", 1, 4);
    expect(mine).not.toEqual(yours);
  });

  it("produces floats that are uniform enough to bet on", () => {
    const values = floatStream(SERVER, generateClientSeed(), 1, 50_000);
    const buckets = new Array(10).fill(0) as number[];
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)] = (buckets[Math.floor(value * 10)] ?? 0) + 1;
    }
    // 5 000 expected per bucket; ±5% is a generous band that still catches a
    // genuinely skewed generator.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(4_500);
      expect(count).toBeLessThan(5_500);
    }
  });
});

describe("payout arithmetic", () => {
  it("multiplies a stake in integers, never in floats", () => {
    // 1.98× of 100.00 USDT (6dp) is exactly 198.00 USDT.
    expect(payoutFor(100_000_000n, COIN_FLIP_MULTIPLIER)).toBe(198_000_000n);
    // A wei-scale stake keeps every digit.
    expect(payoutFor(10n ** 18n, 19_800)).toBe(1_980_000_000_000_000_000n);
  });

  it("never pays out more than the multiplier allows, even on odd stakes", () => {
    const stake = 333_333n;
    expect(payoutFor(stake, 19_800)).toBe((stake * 19_800n) / 10_000n);
  });
});

describe("coin flip", () => {
  it("pays 1.98× — the fair 2× less the stated 1%", () => {
    expect(COIN_FLIP_MULTIPLIER).toBe(19_800);
    expect(COIN_FLIP_MULTIPLIER / MULTIPLIER_SCALE).toBeCloseTo(2 * EXPECTED_RETURN, 10);
  });

  it("returns 99% over many rounds", () => {
    const rounds = 40_000;
    let staked = 0n;
    let returned = 0n;

    for (let nonce = 0; nonce < rounds; nonce += 1) {
      const outcome = playCoinFlip({ pick: "heads" }, SERVER, CLIENT, nonce);
      staked += 1_000_000n;
      returned += payoutFor(1_000_000n, outcome.multiplier);
    }

    const actual = Number(returned) / Number(staked);
    expect(actual).toBeGreaterThan(EXPECTED_RETURN - 0.02);
    expect(actual).toBeLessThan(EXPECTED_RETURN + 0.02);
  });

  it("lands each side about half the time", () => {
    let heads = 0;
    for (let nonce = 0; nonce < 20_000; nonce += 1) {
      if (playCoinFlip({ pick: "heads" }, SERVER, CLIENT, nonce).landed === "heads") heads += 1;
    }
    expect(heads).toBeGreaterThan(9_700);
    expect(heads).toBeLessThan(10_300);
  });
});

describe("dice", () => {
  it("prices every win chance at the same 99% return", () => {
    for (const chance of [2, 10, 25, 50, 75, 95]) {
      const multiplier = diceMultiplier(chance) / MULTIPLIER_SCALE;
      expect(multiplier * (chance / 100)).toBeCloseTo(EXPECTED_RETURN, 3);
    }
  });

  it("wins as often as the chosen chance says it will", () => {
    for (const chance of [10, 50, 90]) {
      let wins = 0;
      const rounds = 20_000;
      for (let nonce = 0; nonce < rounds; nonce += 1) {
        if (playDice({ chance, direction: "under" }, SERVER, CLIENT, nonce).won) wins += 1;
      }
      expect(wins / rounds).toBeCloseTo(chance / 100, 2);
    }
  });

  it("treats over and under as mirror images", () => {
    let underWins = 0;
    let overWins = 0;
    for (let nonce = 0; nonce < 10_000; nonce += 1) {
      if (playDice({ chance: 30, direction: "under" }, SERVER, CLIENT, nonce).won) underWins += 1;
      if (playDice({ chance: 30, direction: "over" }, SERVER, CLIENT, nonce).won) overWins += 1;
    }
    expect(Math.abs(underWins - overWins)).toBeLessThan(400);
  });
});

describe("mines", () => {
  it("places exactly the requested number of mines, and no duplicates", () => {
    for (const mines of [1, 3, 5, 10, 24]) {
      const board = minesBoard({ mines }, SERVER, CLIENT, mines);
      expect(board.mineTiles).toHaveLength(mines);
      expect(new Set(board.mineTiles).size).toBe(mines);
      for (const tile of board.mineTiles) {
        expect(tile).toBeGreaterThanOrEqual(0);
        expect(tile).toBeLessThan(25);
      }
    }
  });

  it("returns 99% at every cash-out depth", () => {
    // Expected return = P(surviving n reveals) × multiplier(n).
    for (const mines of [1, 3, 5]) {
      for (let revealed = 1; revealed <= 5; revealed += 1) {
        let survival = 1;
        for (let step = 0; step < revealed; step += 1) {
          survival *= (25 - mines - step) / (25 - step);
        }
        const multiplier = minesMultiplier(mines, revealed) / MULTIPLIER_SCALE;
        expect(survival * multiplier).toBeCloseTo(EXPECTED_RETURN, 3);
      }
    }
  });

  it("pays more the further you push", () => {
    let previous = 0;
    for (let revealed = 1; revealed <= 10; revealed += 1) {
      const multiplier = minesMultiplier(5, revealed);
      expect(multiplier).toBeGreaterThan(previous);
      previous = multiplier;
    }
  });

  it("places mines reproducibly from the seeds alone", () => {
    const first = minesBoard({ mines: 5 }, SERVER, CLIENT, 42);
    const second = minesBoard({ mines: 5 }, SERVER, CLIENT, 42);
    expect(first.mineTiles).toEqual(second.mineTiles);
  });
});

describe("crash", () => {
  it("never breaks below 1.00×", () => {
    for (let nonce = 0; nonce < 5_000; nonce += 1) {
      expect(crashPoint(SERVER, CLIENT, nonce).crashPoint).toBeGreaterThanOrEqual(MULTIPLIER_SCALE);
    }
  });

  it("busts instantly about one round in a hundred", () => {
    let instant = 0;
    const rounds = 50_000;
    for (let nonce = 0; nonce < rounds; nonce += 1) {
      if (crashPoint(SERVER, CLIENT, nonce).crashPoint === MULTIPLIER_SCALE) instant += 1;
    }
    expect(instant / rounds).toBeCloseTo(0.01, 2);
  });

  it("returns 99% whichever target you pick — no multiplier is a better bet", () => {
    const rounds = 50_000;
    const points: number[] = [];
    for (let nonce = 0; nonce < rounds; nonce += 1) {
      points.push(crashPoint(SERVER, CLIENT, nonce).crashPoint);
    }

    for (const target of [1.5, 2, 5, 10]) {
      const scaledTarget = target * MULTIPLIER_SCALE;
      const survived = points.filter((p) => p >= scaledTarget).length;
      const actual = (survived / rounds) * target;
      expect(actual).toBeGreaterThan(EXPECTED_RETURN - 0.04);
      expect(actual).toBeLessThan(EXPECTED_RETURN + 0.04);
    }
  });
});

describe("plinko", () => {
  it("has one multiplier per bucket", () => {
    expect(PLINKO_MULTIPLIERS).toHaveLength(PLINKO_ROWS + 1);
  });

  it("pays least in the middle and most at the edges", () => {
    const middle = PLINKO_MULTIPLIERS[PLINKO_ROWS / 2] ?? 0;
    expect(PLINKO_MULTIPLIERS[0]).toBeGreaterThan(middle);
    expect(PLINKO_MULTIPLIERS[PLINKO_ROWS]).toBeGreaterThan(middle);
    expect(PLINKO_MULTIPLIERS[0]).toBe(PLINKO_MULTIPLIERS[PLINKO_ROWS]);
  });

  it("returns 99% against the real binomial distribution", () => {
    const binomial = (n: number, k: number) => {
      let result = 1;
      for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
      return result;
    };

    let expected = 0;
    for (let k = 0; k <= PLINKO_ROWS; k += 1) {
      const probability = binomial(PLINKO_ROWS, k) / 2 ** PLINKO_ROWS;
      expected += probability * ((PLINKO_MULTIPLIERS[k] ?? 0) / MULTIPLIER_SCALE);
    }
    expect(expected).toBeGreaterThan(EXPECTED_RETURN - 0.01);
    expect(expected).toBeLessThanOrEqual(EXPECTED_RETURN + 0.001);
  });

  it("drops balls into a binomial spread, not a flat one", () => {
    const counts = new Array(PLINKO_ROWS + 1).fill(0) as number[];
    const rounds = 30_000;
    for (let nonce = 0; nonce < rounds; nonce += 1) {
      const { bucket, path } = plinkoPath(SERVER, CLIENT, nonce);
      expect(path).toHaveLength(PLINKO_ROWS);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    const middle = counts[PLINKO_ROWS / 2] ?? 0;
    const edge = counts[0] ?? 0;
    expect(middle).toBeGreaterThan(edge * 20);

    // The centre bucket's true probability is C(12,6)/4096 ≈ 0.2256.
    expect(middle / rounds).toBeCloseTo(0.2256, 2);
  });
});
