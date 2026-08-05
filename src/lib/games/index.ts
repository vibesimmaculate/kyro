/**
 * Game mathematics.
 *
 * Every payout here is derived from the true odds and then multiplied by
 * (1 − edge). The edge is a stated number, not a mystery: 1% on all five games,
 * printed on each game's page and on /games/fairness, and asserted by tests
 * that simulate the distribution rather than taking the formula's word for it.
 *
 * Multipliers are integers at four decimal places — 19 800 is 1.98× — so a
 * payout is exact integer arithmetic on the stake and never a float.
 */

import { floatStream, seededShuffle } from "@/lib/fair";

export const GAMES = ["tower", "coin-flip", "dice", "mines", "crash", "plinko"] as const;
export type GameId = (typeof GAMES)[number];

/** One percent. Held in basis points so it cannot drift. */
export const HOUSE_EDGE_BP = 100;

export const MULTIPLIER_SCALE = 10_000;

/** Applies the house edge to a fair multiplier and floors to 4dp. */
export function withEdge(fairMultiplier: number): number {
  const scaled = fairMultiplier * MULTIPLIER_SCALE * ((10_000 - HOUSE_EDGE_BP) / 10_000);
  return Math.max(0, Math.floor(scaled));
}

/** stake × multiplier, entirely in integers. */
export function payoutFor(stake: bigint, multiplier: number): bigint {
  return (stake * BigInt(multiplier)) / BigInt(MULTIPLIER_SCALE);
}

export function formatMultiplier(multiplier: number): string {
  return `${(multiplier / MULTIPLIER_SCALE).toFixed(2)}×`;
}

/* ── Coin flip ─────────────────────────────────────────────────────────── */

export type CoinSide = "heads" | "tails";

export interface CoinFlipParams {
  readonly pick: CoinSide;
}

export interface CoinFlipOutcome {
  readonly landed: CoinSide;
  readonly won: boolean;
  readonly multiplier: number;
}

/** A fair coin pays 2×; after the edge, 1.98×. */
export const COIN_FLIP_MULTIPLIER = withEdge(2);

export function playCoinFlip(
  params: CoinFlipParams,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): CoinFlipOutcome {
  const [value = 0] = floatStream(serverSeed, clientSeed, nonce, 1);
  const landed: CoinSide = value < 0.5 ? "heads" : "tails";
  const won = landed === params.pick;
  return { landed, won, multiplier: won ? COIN_FLIP_MULTIPLIER : 0 };
}

/* ── Dice ──────────────────────────────────────────────────────────────── */

export interface DiceParams {
  /** 0.01–98.99, the chance of winning as a percentage. */
  readonly chance: number;
  readonly direction: "under" | "over";
}

export interface DiceOutcome {
  /** 0.00–99.99, the number rolled. */
  readonly roll: number;
  readonly target: number;
  readonly won: boolean;
  readonly multiplier: number;
}

export const DICE_MIN_CHANCE = 1;
export const DICE_MAX_CHANCE = 95;

/** Fair payout is 100/chance; after the edge, 99/chance. */
export function diceMultiplier(chance: number): number {
  const clamped = Math.min(DICE_MAX_CHANCE, Math.max(DICE_MIN_CHANCE, chance));
  return withEdge(100 / clamped);
}

export function playDice(
  params: DiceParams,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): DiceOutcome {
  const [value = 0] = floatStream(serverSeed, clientSeed, nonce, 1);
  const roll = Math.floor(value * 10_000) / 100;
  const chance = Math.min(DICE_MAX_CHANCE, Math.max(DICE_MIN_CHANCE, params.chance));

  const target = params.direction === "under" ? chance : 100 - chance;
  const won = params.direction === "under" ? roll < target : roll > target;

  return { roll, target, won, multiplier: won ? diceMultiplier(chance) : 0 };
}

/* ── Mines ─────────────────────────────────────────────────────────────── */

export const MINES_TILES = 25;

export interface MinesParams {
  readonly mines: number;
}

export interface MinesBoard {
  /** Tile indices holding a mine. Fixed by the seeds before the first click. */
  readonly mineTiles: readonly number[];
}

/**
 * Fair multiplier after revealing `revealed` safe tiles from a board of 25 with
 * `mines` bombs.
 *
 * Each safe reveal has probability (safe remaining)/(tiles remaining), so the
 * fair return is the reciprocal of their product. The edge is applied once, at
 * the end, rather than compounding per tile.
 */
export function minesMultiplier(mines: number, revealed: number): number {
  if (revealed <= 0) return MULTIPLIER_SCALE;
  const safe = MINES_TILES - mines;
  if (revealed > safe) return 0;

  let fair = 1;
  for (let step = 0; step < revealed; step += 1) {
    fair *= (MINES_TILES - step) / (safe - step);
  }
  return withEdge(fair);
}

export function minesBoard(
  params: MinesParams,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): MinesBoard {
  const tiles = Array.from({ length: MINES_TILES }, (_, i) => i);
  const floats = floatStream(serverSeed, clientSeed, nonce, MINES_TILES);
  return { mineTiles: seededShuffle(tiles, floats).slice(0, params.mines).sort((a, b) => a - b) };
}

/* ── Crash ─────────────────────────────────────────────────────────────── */

export interface CrashOutcome {
  /** Where the curve broke, at four decimal places. */
  readonly crashPoint: number;
}

/**
 * The standard 1%-edge crash distribution.
 *
 * One round in a hundred busts instantly at 1.00×; the rest follow
 * 0.99/(1 − u), which gives P(crash ≥ m) = 0.99/m and therefore a return of
 * exactly 99% at every cash-out target. That property is what makes the game
 * honest: no multiplier is a better or worse bet than any other.
 */
export function crashPoint(serverSeed: string, clientSeed: string, nonce: number): CrashOutcome {
  const [value = 0] = floatStream(serverSeed, clientSeed, nonce, 1);

  if (value < HOUSE_EDGE_BP / 10_000) {
    return { crashPoint: MULTIPLIER_SCALE };
  }

  const fair = 1 / (1 - value);
  const withHouse = fair * ((10_000 - HOUSE_EDGE_BP) / 10_000);
  return { crashPoint: Math.max(MULTIPLIER_SCALE, Math.floor(withHouse * MULTIPLIER_SCALE)) };
}

/* ── Plinko ────────────────────────────────────────────────────────────── */

export const PLINKO_ROWS = 12;

/**
 * Where a ball lands, as the count of right-bounces over twelve rows — a
 * binomial distribution over thirteen buckets.
 */
export function plinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): { path: readonly ("L" | "R")[]; bucket: number } {
  const floats = floatStream(serverSeed, clientSeed, nonce, PLINKO_ROWS);
  const path = floats.map((f) => (f < 0.5 ? "L" : "R") as "L" | "R");
  return { path, bucket: path.filter((step) => step === "R").length };
}

/**
 * Bucket multipliers, derived rather than chosen.
 *
 * Each bucket's probability is C(12,k)/2^12. A payout of 0.99/p would return
 * exactly 99% but puts absurd numbers on the edges, so the curve is shaped by a
 * exponent and then normalised so the expected return lands on 99% — computed
 * here, at module load, not typed in by hand.
 */
function buildPlinkoMultipliers(): readonly number[] {
  const binomial = (n: number, k: number): number => {
    let result = 1;
    for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
    return result;
  };

  const total = 2 ** PLINKO_ROWS;
  const probabilities = Array.from(
    { length: PLINKO_ROWS + 1 },
    (_, k) => binomial(PLINKO_ROWS, k) / total,
  );

  // Shape: rarer buckets pay more, but tempered so the extremes stay readable.
  const shape = probabilities.map((p) => Math.pow(1 / p, 0.62));

  const expected = shape.reduce((sum, value, k) => sum + value * (probabilities[k] ?? 0), 0);
  const scale = (10_000 - HOUSE_EDGE_BP) / 10_000 / expected;

  return shape.map((value) => Math.max(1, Math.floor(value * scale * MULTIPLIER_SCALE)));
}

export const PLINKO_MULTIPLIERS = buildPlinkoMultipliers();

export function plinkoMultiplier(bucket: number): number {
  return PLINKO_MULTIPLIERS[bucket] ?? 0;
}


/* ── Tower ─────────────────────────────────────────────────────────────── */

/**
 * Tower.
 *
 * Eight floors. On each one you pick a door; one of them is a trap. Survive and
 * you climb, and the multiplier climbs with you. Stop whenever you like.
 *
 * It is the simplest possible shape for a gambling game — one decision,
 * repeated, with a rising cost of being wrong — and that is exactly why it
 * works: there is nothing to learn, and the only real choice is when to stop.
 * The difficulty setting changes the number of doors, which changes both the
 * risk and the pace of the climb.
 */

export const TOWER_FLOORS = 8;

export type TowerDifficulty = "easy" | "medium" | "hard" | "brutal";

export interface TowerRules {
  /** Doors on each floor. */
  readonly doors: number;
  /** How many of them are safe. */
  readonly safe: number;
  readonly label: string;
}

export const TOWER_RULES: Record<TowerDifficulty, TowerRules> = {
  easy: { doors: 4, safe: 3, label: "3 of 4 safe" },
  medium: { doors: 3, safe: 2, label: "2 of 3 safe" },
  hard: { doors: 2, safe: 1, label: "1 of 2 safe" },
  brutal: { doors: 4, safe: 1, label: "1 of 4 safe" },
};

/**
 * Multiplier after clearing `floors` floors.
 *
 * Each floor is an independent (safe / doors) chance, so the fair return is the
 * reciprocal of their product. The edge is applied once at the top rather than
 * compounding per floor — the same treatment Mines gets, and the reason a long
 * climb is not quietly punished twice.
 */
export function towerMultiplier(difficulty: TowerDifficulty, floors: number): number {
  if (floors <= 0) return MULTIPLIER_SCALE;
  const rules = TOWER_RULES[difficulty];
  if (floors > TOWER_FLOORS) return 0;

  const fair = Math.pow(rules.doors / rules.safe, floors);
  return withEdge(fair);
}

export interface TowerBoard {
  /** For each floor, the index of the door that ends the climb. */
  readonly traps: readonly number[][];
}

/**
 * The whole tower, fixed by the seeds before the first door is touched.
 *
 * Every floor's trap positions are derived up front, so the board a player
 * walks through is the one the commitment hash already promised — the server
 * cannot decide where the trap goes after seeing which door was picked.
 */
export function towerBoard(
  difficulty: TowerDifficulty,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): TowerBoard {
  const rules = TOWER_RULES[difficulty];
  const trapsPerFloor = rules.doors - rules.safe;
  const floats = floatStream(serverSeed, clientSeed, nonce, TOWER_FLOORS * rules.doors);

  const traps: number[][] = [];
  for (let floor = 0; floor < TOWER_FLOORS; floor += 1) {
    const doors = Array.from({ length: rules.doors }, (_, i) => i);
    const slice = floats.slice(floor * rules.doors, (floor + 1) * rules.doors);
    traps.push(seededShuffle(doors, slice).slice(0, trapsPerFloor).sort((a, b) => a - b));
  }

  return { traps };
}

/* ── Description used across the games wing ────────────────────────────── */

export interface GameMeta {
  readonly id: GameId;
  readonly name: string;
  readonly tagline: string;
  readonly rule: string;
  readonly accent: "blue" | "green" | "amber" | "red";
}

export const GAME_META: Record<GameId, GameMeta> = {
  tower: {
    id: "tower",
    name: "Tower",
    tagline: "Eight floors. One way down.",
    rule: "Pick a door on each floor. Climb as high as your nerve holds, and take the money whenever you want it.",
    accent: "blue",
  },
  "coin-flip": {
    id: "coin-flip",
    name: "Coin Flip",
    tagline: "One call. One flip.",
    rule: "Pick a side. Land it and your stake pays 1.98×.",
    accent: "blue",
  },
  dice: {
    id: "dice",
    name: "Dice",
    tagline: "Set your own odds.",
    rule: "Choose how likely you want to win. The payout moves with it.",
    accent: "green",
  },
  mines: {
    id: "mines",
    name: "Mines",
    tagline: "Stop while you are ahead.",
    rule: "Reveal safe tiles on a grid of 25. Cash out any time. Hit a mine and it is gone.",
    accent: "amber",
  },
  crash: {
    id: "crash",
    name: "Crash",
    tagline: "Out before it breaks.",
    rule: "The multiplier climbs from 1.00×. Take it before the curve breaks.",
    accent: "red",
  },
  plinko: {
    id: "plinko",
    name: "Plinko",
    tagline: "Twelve rows, thirteen ends.",
    rule: "A ball falls through twelve rows. The bucket it lands in sets your payout.",
    accent: "blue",
  },
};
