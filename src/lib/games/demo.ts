/**
 * Demo mode.
 *
 * Every game, playable immediately: no account, no deposit, no database. The
 * rounds run entirely in the browser against a seed pair generated there, using
 * the exact same mathematics the real games use — the same multipliers, the
 * same 1% edge, the same distributions.
 *
 * One thing it is not, and the interface says so plainly: **provably fair**.
 * When your own browser holds both seeds there is nobody to prove anything to.
 * The point of demo mode is to learn the game and feel the odds, not to audit
 * KYRO. Pretending otherwise would be the kind of small lie this product does
 * not tell.
 *
 * The balance lives in localStorage and can be topped up freely, because it is
 * worth nothing.
 */

import {
  COIN_FLIP_MULTIPLIER,
  MINES_TILES,
  TOWER_FLOORS,
  TOWER_RULES,
  crashPoint,
  diceMultiplier,
  minesBoard,
  minesMultiplier,
  payoutFor,
  playCoinFlip,
  playDice,
  plinkoMultiplier,
  plinkoPath,
  PLINKO_RISK,
  PLINKO_ROWS,
  type PlinkoRisk,
  type PlinkoRows,
  towerBoard,
  towerMultiplier,
  type CoinSide,
  type TowerDifficulty,
} from "@/lib/games";
import { generateClientSeed, generateServerSeed } from "@/lib/fair";

const BALANCE_KEY = "kyro.demo.balance";
const SEED_KEY = "kyro.demo.seed";
const NONCE_KEY = "kyro.demo.nonce";

/** 1 000.00 in six-decimal units — the same shape as a real USDT balance. */
export const DEMO_STARTING_BALANCE = 1_000_000_000n;

export function demoBalance(): bigint {
  if (typeof window === "undefined") return DEMO_STARTING_BALANCE;
  const stored = window.localStorage.getItem(BALANCE_KEY);
  if (stored === null) return DEMO_STARTING_BALANCE;
  try {
    return BigInt(stored);
  } catch {
    return DEMO_STARTING_BALANCE;
  }
}

/**
 * Subscribers for `useSyncExternalStore`.
 *
 * The demo balance changes from inside game logic rather than from a React
 * event, so components watch it as an external store instead of being handed a
 * callback through six levels of props.
 */
const listeners = new Set<() => void>();

export function subscribeToDemoBalance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A string, because useSyncExternalStore compares snapshots by identity. */
export function demoBalanceSnapshot(): string {
  return demoBalance().toString();
}

export function setDemoBalance(next: bigint): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BALANCE_KEY, (next < 0n ? 0n : next).toString());
  for (const listener of listeners) listener();
}

export function resetDemoBalance(): bigint {
  setDemoBalance(DEMO_STARTING_BALANCE);
  return DEMO_STARTING_BALANCE;
}

function seeds(): { serverSeed: string; clientSeed: string } {
  if (typeof window === "undefined") {
    return { serverSeed: "demo", clientSeed: "demo" };
  }
  const stored = window.localStorage.getItem(SEED_KEY);
  if (stored) {
    const [serverSeed = "", clientSeed = ""] = stored.split(":");
    if (serverSeed && clientSeed) return { serverSeed, clientSeed };
  }
  const fresh = { serverSeed: generateServerSeed(), clientSeed: generateClientSeed() };
  window.localStorage.setItem(SEED_KEY, `${fresh.serverSeed}:${fresh.clientSeed}`);
  return fresh;
}

function nextNonce(): number {
  if (typeof window === "undefined") return 1;
  const current = Number(window.localStorage.getItem(NONCE_KEY) ?? "0") + 1;
  window.localStorage.setItem(NONCE_KEY, String(current));
  return current;
}

/** Takes the stake, returns false if the demo balance cannot cover it. */
function stakeDemo(amount: bigint): boolean {
  const balance = demoBalance();
  if (amount <= 0n || amount > balance) return false;
  setDemoBalance(balance - amount);
  return true;
}

function payDemo(amount: bigint): bigint {
  const next = demoBalance() + amount;
  setDemoBalance(next);
  return next;
}

/* ── Single-shot games ─────────────────────────────────────────────────── */

export interface DemoRoundResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly multiplier?: number;
  readonly payout?: string;
  readonly outcome?: Record<string, unknown>;
  readonly balance?: string;
  readonly nonce?: number;
}

function settle(
  stake: bigint,
  multiplier: number,
  outcome: Record<string, unknown>,
  nonce: number,
  /**
   * Withholds the payout for the caller to credit later.
   *
   * Plinko needs it. The round is computed the instant the ball is released,
   * but the ball then spends three seconds falling — and crediting the win at
   * computation time puts it on the balance readout while the ball is still
   * halfway down the board, which gives the answer away before the board does.
   */
  defer = false,
): DemoRoundResult {
  const payout = payoutFor(stake, multiplier);
  const balance = payout > 0n && !defer ? payDemo(payout) : demoBalance();
  return {
    ok: true,
    roundId: `demo-${nonce}`,
    multiplier,
    payout: String(payout),
    outcome,
    balance: String(balance),
    nonce,
  };
}

const INSUFFICIENT: DemoRoundResult = {
  ok: false,
  error: "That is more than your demo balance. Reset it below to carry on.",
};

export function demoCoinFlip(stake: bigint, pick: CoinSide): DemoRoundResult {
  if (!stakeDemo(stake)) return INSUFFICIENT;
  const { serverSeed, clientSeed } = seeds();
  const nonce = nextNonce();
  const result = playCoinFlip({ pick }, serverSeed, clientSeed, nonce);
  return settle(
    stake,
    result.won ? COIN_FLIP_MULTIPLIER : 0,
    { landed: result.landed, won: result.won },
    nonce,
  );
}

export function demoDice(
  stake: bigint,
  chance: number,
  direction: "under" | "over",
): DemoRoundResult {
  if (!stakeDemo(stake)) return INSUFFICIENT;
  const { serverSeed, clientSeed } = seeds();
  const nonce = nextNonce();
  const result = playDice({ chance, direction }, serverSeed, clientSeed, nonce);
  return settle(
    stake,
    result.won ? diceMultiplier(chance) : 0,
    { roll: result.roll, target: result.target, won: result.won },
    nonce,
  );
}

export function demoCrash(stake: bigint, target: number): DemoRoundResult {
  if (!stakeDemo(stake)) return INSUFFICIENT;
  const { serverSeed, clientSeed } = seeds();
  const nonce = nextNonce();
  const { crashPoint: point } = crashPoint(serverSeed, clientSeed, nonce);
  const survived = point >= target;
  return settle(
    stake,
    survived ? target : 0,
    { crashPoint: point, target, survived },
    nonce,
  );
}

export function demoPlinko(
  stake: bigint,
  rows: PlinkoRows = PLINKO_ROWS,
  risk: PlinkoRisk = PLINKO_RISK,
): DemoRoundResult {
  if (!stakeDemo(stake)) return INSUFFICIENT;
  const { serverSeed, clientSeed } = seeds();
  const nonce = nextNonce();
  const { path, bucket } = plinkoPath(serverSeed, clientSeed, nonce, rows);
  return settle(
    stake,
    plinkoMultiplier(bucket, rows, risk),
    { path: [...path], bucket, rows, risk },
    nonce,
    true,
  );
}

/** Credits a payout `demoPlinko` withheld, once the ball has actually landed. */
export function creditDemoPayout(amount: bigint): bigint {
  return amount > 0n ? payDemo(amount) : demoBalance();
}

/* ── Step-by-step games ────────────────────────────────────────────────── */

/**
 * Mines and Tower are played a move at a time, so the demo needs a small
 * stateful runner rather than a single call. The board is fixed the moment the
 * round opens, exactly as it is on the server.
 */
export interface MinesDemoState {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly revealed?: readonly number[];
  readonly multiplier?: number;
  readonly nextMultiplier?: number;
  readonly busted?: boolean;
  readonly mineTiles?: readonly number[];
  readonly payout?: string;
  readonly balance?: string;
  readonly finished?: boolean;
}

export interface MinesDemoRunner {
  open(options: { mines: number; stake: bigint }): MinesDemoState;
  reveal(tile: number): MinesDemoState;
  cashOut(): MinesDemoState;
}

export function createMinesDemo(): MinesDemoRunner {
  let mines = 3;
  let stake = 0n;
  let board: readonly number[] = [];
  let revealed: number[] = [];
  let open = false;
  let id = "";

  return {
    open(options) {
      if (!stakeDemo(options.stake)) return INSUFFICIENT as MinesDemoState;
      const { serverSeed, clientSeed } = seeds();
      const nonce = nextNonce();
      mines = options.mines;
      stake = options.stake;
      board = minesBoard({ mines }, serverSeed, clientSeed, nonce).mineTiles;
      revealed = [];
      open = true;
      id = `demo-${nonce}`;
      return {
        ok: true,
        roundId: id,
        revealed: [],
        multiplier: 10_000,
        nextMultiplier: minesMultiplier(mines, 1),
        balance: String(demoBalance()),
      };
    },

    reveal(tile) {
      if (!open) return { ok: false, error: "That round is already finished." };
      if (revealed.includes(tile)) return { ok: false, error: "Already revealed." };

      if (board.includes(tile)) {
        open = false;
        revealed = [...revealed, tile];
        return {
          ok: true,
          roundId: id,
          revealed,
          busted: true,
          finished: true,
          mineTiles: board,
          multiplier: 0,
          balance: String(demoBalance()),
        };
      }

      revealed = [...revealed, tile];
      if (revealed.length === MINES_TILES - mines) return this.cashOut();

      return {
        ok: true,
        roundId: id,
        revealed,
        busted: false,
        multiplier: minesMultiplier(mines, revealed.length),
        nextMultiplier: minesMultiplier(mines, revealed.length + 1),
      };
    },

    cashOut() {
      if (!open || revealed.length === 0) {
        return { ok: false, error: "Reveal a tile first." };
      }
      open = false;
      const multiplier = minesMultiplier(mines, revealed.length);
      const payout = payoutFor(stake, multiplier);
      const balance = payDemo(payout);
      return {
        ok: true,
        roundId: id,
        revealed,
        finished: true,
        busted: false,
        multiplier,
        payout: String(payout),
        mineTiles: board,
        balance: String(balance),
      };
    },
  };
}

export interface DemoTowerState {
  readonly ok: boolean;
  readonly error?: string;
  readonly roundId?: string;
  readonly difficulty?: TowerDifficulty;
  readonly climbed?: readonly number[];
  readonly multiplier?: number;
  readonly nextMultiplier?: number;
  readonly busted?: boolean;
  readonly finished?: boolean;
  readonly traps?: readonly number[][];
  readonly payout?: string;
  readonly balance?: string;
}

export interface DemoRunner {
  open(options: { difficulty: TowerDifficulty; stake: bigint }): DemoTowerState;
  climb(door: number): DemoTowerState;
  cashOut(): DemoTowerState;
}

export function runDemoTower(): DemoRunner {
  let difficulty: TowerDifficulty = "medium";
  let stake = 0n;
  let traps: readonly number[][] = [];
  let climbed: number[] = [];
  let open = false;
  let id = "";

  return {
    open(options) {
      if (!stakeDemo(options.stake)) return INSUFFICIENT as DemoTowerState;
      const { serverSeed, clientSeed } = seeds();
      const nonce = nextNonce();
      difficulty = options.difficulty;
      stake = options.stake;
      traps = towerBoard(difficulty, serverSeed, clientSeed, nonce).traps;
      climbed = [];
      open = true;
      id = `demo-${nonce}`;
      return {
        ok: true,
        roundId: id,
        difficulty,
        climbed: [],
        multiplier: 10_000,
        nextMultiplier: towerMultiplier(difficulty, 1),
        balance: String(demoBalance()),
      };
    },

    climb(door) {
      if (!open) return { ok: false, error: "That round is already finished." };
      const floor = climbed.length;
      const floorTraps = traps[floor] ?? [];

      if (floorTraps.includes(door)) {
        open = false;
        climbed = [...climbed, door];
        return {
          ok: true,
          roundId: id,
          difficulty,
          climbed,
          busted: true,
          finished: true,
          traps,
          multiplier: 0,
          balance: String(demoBalance()),
        };
      }

      climbed = [...climbed, door];
      if (climbed.length === TOWER_FLOORS) return this.cashOut();

      return {
        ok: true,
        roundId: id,
        difficulty,
        climbed,
        busted: false,
        multiplier: towerMultiplier(difficulty, climbed.length),
        nextMultiplier: towerMultiplier(difficulty, climbed.length + 1),
      };
    },

    cashOut() {
      if (!open || climbed.length === 0) {
        return { ok: false, error: "Clear a floor first." };
      }
      open = false;
      const multiplier = towerMultiplier(difficulty, climbed.length);
      const payout = payoutFor(stake, multiplier);
      const balance = payDemo(payout);
      return {
        ok: true,
        roundId: id,
        difficulty,
        climbed,
        finished: true,
        busted: false,
        multiplier,
        payout: String(payout),
        traps,
        balance: String(balance),
      };
    },
  };
}

export const TOWER_DIFFICULTIES = Object.keys(TOWER_RULES) as TowerDifficulty[];
