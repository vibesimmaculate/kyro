# KYRO

**Cash to crypto. Crypto to cash.**

A Balkan cash↔crypto exchange counter, and a separate games wing with real
on-chain deposits and withdrawals.

Two products, one design system, three visual registers:

| | |
|---|---|
| **The exchange** — `/` | Paper, hairlines, receipt typography. Open to anyone; no account. |
| **The games** — `/games` | The same system inverted onto ink. Account, age check and limits required. |
| **The counter console** — `/operator` | Dense mono tables for staff on a shift. No polish by design. |

---

## Running it

```bash
pnpm install
pnpm db:start          # local Supabase (needs Docker) — prints its keys
pnpm keys:dev          # generates a TESTNET-only HD mnemonic into .env.local
pnpm db:seed           # two demonstration exchange orders
pnpm db:player         # a player with a credited balance, for the games
pnpm dev
```

Copy `.env.example` to `.env.local` first and paste in the Supabase keys that
`pnpm db:start` prints.

Without Supabase configured the exchange still runs end to end — orders fall
back to an in-process store that says so. The games need a database and refuse
politely without one.

## Verifying it

```bash
pnpm lint          # ESLint, incl. bans on Math.random and parseFloat
pnpm typecheck     # tsc --noEmit, strict
pnpm test          # Vitest — money, quotes, ledger, fairness, game odds
pnpm build         # production build
pnpm e2e           # Playwright — flows, games, responsive, axe
pnpm shots         # renders every page at 390/768/1440 for a look
```

---

## The parts worth reading first

| Path | Why |
|---|---|
| `src/lib/money/fixed.ts` | bigint fixed-point. Nothing in the product multiplies money with a float. |
| `src/lib/quote/engine.ts` | The 4% fee, both directions, pure and shared by browser and server. |
| `supabase/migrations/` | Schema, RLS, grants, and the constraint that makes the ledger a ledger. |
| `src/server/ledger/index.ts` | Double-entry postings and the sign convention they follow. |
| `src/lib/fair/index.ts` | Provably fair: commit, reveal, recompute. |
| `src/lib/games/index.ts` | Every payout derived from true odds less a stated 1% edge. |
| `src/server/chains/` | Bitcoin, EVM, Tron and Solana behind one interface. |
| `src/app/globals.css` | The design tokens, and why the third grey is barely lighter than the second. |

---

## Rules this codebase holds itself to

**Money never touches a float.** Fiat is an integer count of the smallest cash
unit a cashier can hand over; crypto is an integer count of the chain's base
unit. Both cross the wire as decimal strings. `parseFloat` and `Math.random`
are banned by lint, with the reasons in the rule messages.

**Postgres `numeric` is read with `::text`.** A plain select returns a JSON
number, and `1234567890123456789012345` comes back as `1.2345678901234568e+24`.
There is a regression test that proves it.

**Balances are derived, never stored.** They are the sum of ledger postings, and
a deferred database constraint refuses any transaction whose postings do not sum
to zero per asset. Value can only be moved.

**Deposits credit after confirmations, not on sight.** Withdrawals reserve funds
immediately, pass per-user and per-day caps, and wait for a human above the
approval threshold.

**Nothing is invented.** No volume figures, customer counts, testimonials,
ratings, partner logos, licence numbers or RTP claims. Preview rates say
"Preview rate". Sample locations say "Sample". The games wing states, on every
page, that it holds no licence.

---

## Deliberately not real

- **Exchange rates** — a fixed table with deterministic per-minute drift,
  labelled "Preview rate" everywhere. Replace `RateProvider` in
  `src/lib/rates/preview.ts`.
- **Locations** — twelve plausible branches in real cities, marked as sample
  data on every surface. Replace `LocationProvider`.
- **Network fees** — a sample table. Replace `NetworkFeeProvider`.
- **KYC decisions** — the status field and the gate are real; no verification
  provider is integrated, so an operator approves manually.

Everything else is real: the arithmetic, the ledger, the seeds, the addresses,
the signing, and the transactions.

---

## Before this touches real money

It runs on testnet by default and needs two switches thrown to reach mainnet —
`KYRO_NETWORK_MODE=mainnet` **and** `KYRO_MAINNET_ARMED=yes` — because one env
var is too easy to set by accident.

Beyond that: a security audit of the custody and ledger paths, a gaming licence
in every market the games are offered in, real KYC/AML, and a secret manager in
place of `.env.local`. The token contract addresses in
`src/server/chains/config.ts` carry a warning to verify them against each
issuer's own documentation first.
