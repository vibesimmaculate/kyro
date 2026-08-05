<div align="center">

# KYRO

**Cash to crypto. Crypto to cash.**

A Balkan cash↔crypto exchange counter, and a games wing you can play
without an account.

[Running it](#running-it) · [Verifying it](#verifying-it) · [Architecture](#architecture) ·
[The rules this codebase holds itself to](#the-rules-this-codebase-holds-itself-to) ·
[What is deliberately not real](#what-is-deliberately-not-real)

</div>

---

## What this is

Two products that share one design system and one set of rails.

**The exchange** is the whole point. You price an exchange, see the 4% fee in
full, pick a counter, and walk in. No account, no application, no approval — you
get an order code and track it with that. It is meant to be simpler than booking
a hotel room, and the entire interface is built to keep that promise.

**The games wing** is a separate room in the same building. Six games, a stated
1% house edge, and outcomes you can recompute yourself. Anyone can play
immediately in demo mode; real balances need an account, an age check and limits
you set on yourself.

**The counter console** is for staff working a shift: dense mono tables, a
payout approval queue, and a reconciliation figure that says what KYRO owes its
customers.

| Register | Where | Looks like |
|---|---|---|
| Paper | `/` | Hairlines, receipt typography, one blue square |
| Night | `/games` | The same system inverted onto ink |
| Console | `/operator` | A terminal. No polish, on purpose |

---

## Running it

```bash
pnpm install
pnpm db:start          # local Supabase via Docker — prints its keys
pnpm keys:dev          # a TESTNET-only HD mnemonic, written to .env.local
pnpm db:seed           # two demonstration exchange orders
pnpm db:player         # a player with a credited balance
pnpm dev
```

Copy `.env.example` to `.env.local` first and paste in the keys `pnpm db:start`
prints.

**It degrades honestly.** Without Supabase the exchange still runs end to end —
orders fall back to an in-process store, and the UI says so rather than
pretending. Without custody keys, deposit addresses cannot be derived and the
wallet page explains why. Nothing fails silently.

## Verifying it

```bash
pnpm lint          # ESLint, incl. bans on Math.random and parseFloat
pnpm typecheck     # tsc --noEmit, strict, noUncheckedIndexedAccess
pnpm test          # Vitest — money, quotes, ledger, fairness, game odds
pnpm build         # production build
pnpm e2e           # Playwright — flows, games, responsive, axe
pnpm shots         # renders every page at 390/768/1440 to look at
```

The game odds are verified by **simulation**, not by trusting the formula: the
suite plays tens of thousands of rounds of each game and asserts the return
lands on 99%.

---

## Architecture

```
src/
  lib/
    money/        bigint fixed-point. No float touches money, anywhere.
    quote/        The 4% fee, both directions. Pure; runs on client and server.
    fair/         Provably fair: commit, reveal, recompute.
    games/        Six games' mathematics, plus the browser-side demo runner.
    sound/        Synthesised audio. No files to ship.
    seo/          One source of truth for metadata, JSON-LD and /llms.txt.
  server/
    ledger/       Double-entry postings. Balances are derived, never stored.
    chains/       Bitcoin, EVM, Tron, Solana behind one adapter interface.
    wallet/       Deposit watcher and the withdrawal approval queue.
    orders/       The exchange order lifecycle, behind a swappable store.
supabase/
  migrations/     Schema, RLS, grants, and the constraint that makes it a ledger.
```

### Read these first

| Path | Why |
|---|---|
| [`src/lib/money/fixed.ts`](src/lib/money/fixed.ts) | The arithmetic everything else depends on |
| [`src/lib/quote/engine.ts`](src/lib/quote/engine.ts) | The 4% fee, both directions |
| [`supabase/migrations/`](supabase/migrations/) | Schema, RLS, and the balance constraint |
| [`src/server/ledger/index.ts`](src/server/ledger/index.ts) | Double-entry, and its sign convention |
| [`src/lib/fair/index.ts`](src/lib/fair/index.ts) | The fairness guarantee, in forty lines |
| [`src/lib/games/index.ts`](src/lib/games/index.ts) | Every payout derived from true odds |
| [`src/app/globals.css`](src/app/globals.css) | The tokens, and why the third grey is barely lighter than the second |

---

## The rules this codebase holds itself to

**Money never touches a float.** Fiat is an integer count of the smallest unit a
cashier can physically hand over — which is why dinar and denar are quoted whole
and euro is quoted to two places. Crypto is an integer count of the chain's base
unit. Both cross the wire as decimal strings. `parseFloat` and `Math.random` are
banned by lint, with the reason in the rule message.

**Postgres `numeric` is read with `::text`.** A plain select returns a JSON
number, and `1234567890123456789012345` comes back as `1.2345678901234568e+24`.
There is [a regression test](tests/integration/ledger.test.ts) that demonstrates
it against a real database.

**Balances are derived, never stored.** They are the sum of ledger postings, and
a deferred database constraint rejects any transaction whose postings do not sum
to zero per asset. Value can only be moved, never conjured — asserted by test.

**Bets settle atomically.** Balance check and both postings happen inside one
Postgres function under an advisory lock. Ten concurrent bets against a balance
that covers five result in exactly five — also asserted by test.

**Deposits credit after confirmations, not on sight**, with reorg handling and
idempotency on `(chain, tx_hash, index)`. Withdrawals reserve funds immediately,
enforce per-user and daily caps, and wait for a human above the threshold.

**Mainnet needs two switches thrown.** `KYRO_NETWORK_MODE=mainnet` *and*
`KYRO_MAINNET_ARMED=yes`, because one environment variable is too easy to set by
accident and the blast radius is real customer funds.

**Nothing is invented.** No volume figures, customer counts, testimonials,
ratings, partner logos, licence numbers or RTP claims. Preview rates say
"Preview rate". Sample locations say "Sample". The games wing states on every
page that it holds no licence.

---

## The games

Six games, one stated edge of **1%**, printed on every game page rather than
buried in terms.

| Game | The shape of it |
|---|---|
| **Tower** | Eight floors, one trapped door on each. Climb, or take the money. |
| Coin Flip | One call, 1.98× on a fair 2×. |
| Dice | You choose the odds; the payout follows at 99 ÷ chance. |
| Mines | 25 tiles, cash out whenever. |
| Crash | A curve that breaks. Every target returns the same 99%. |
| Plinko | Twelve rows, thirteen buckets, multipliers derived from the binomial. |

### Provably fair

`HMAC-SHA256(serverSeed, clientSeed:nonce)`. The seed hash is published before
you play and revealed when you rotate it, at which point every round you played
against it can be recomputed — by you, in your browser, on
[`/games/fairness`](src/app/(games)/games/fairness/page.tsx), using the same
module the server runs.

### Demo mode

Every game is playable with no account and no deposit. Same mathematics, same
multipliers, same edge.

It is **not** provably fair, and the interface says so plainly: in demo your own
browser generates both seeds, so there is nobody to prove anything to. Demo mode
is for learning the game and feeling the odds. Claiming a guarantee that only
applies once you are signed in would be exactly the kind of small lie this
product does not tell.

### On sound and "game feel"

The audio is synthesised at runtime — no files to download, so the first tap is
never silent. It is built to one rule: **sound reports what happened, it never
oversells it.**

- A win chimes in proportion to what was actually won.
- A loss is a short, low, unglamorous thud. It is never dressed up as a win.
- Climbing a Tower floor plays the next note of a rising pentatonic scale. It
  feels good because it is telling the truth about the number on screen.

Deliberately absent: losses disguised as wins, manufactured near-misses, hidden
balances, and autoplay that outlives your intent. Sound is one toggle away in
the header, and everything respects `prefers-reduced-motion`.

### Playing responsibly is built, not badged

Age confirmation with a real date of birth. Deposit and loss caps. Session
reminders. Self-exclusion that takes effect at once and that the **database
refuses to shorten** — the trigger rejects any update that brings the date
forward, including one made by an administrator.

---

## Findable and quotable

Search engines, answer engines and assistants all get the same facts from the
same source.

- **[`sitemap.xml`](src/app/sitemap.ts)** and **[`robots.txt`](src/app/robots.ts)** —
  public pages indexed; orders, the order flow, the operator console and the
  games wing all excluded. Indexing gambling pages into markets KYRO has no
  licence for is how an operator gets fined.
- **JSON-LD** — `Organization`, `WebSite`, `FinancialProduct` (with the fee as a
  real field), `FAQPage`, `FinancialService` per location with opening hours and
  coordinates, and `BreadcrumbList`. No `AggregateRating`, because inventing one
  is the most common abuse of this markup and the rich result is not worth lying
  for.
- **[`/llms.txt`](src/app/llms.txt/route.ts)** — a plain-text brief generated
  from the same constants the site renders, so it cannot drift. It states the
  fee precisely, and it explicitly warns any model reading it that the rates are
  preview values and the locations are samples.
- **Open Graph images** generated from the design tokens, so the share card can
  never fall out of step with the brand.

Every public page declares a canonical URL. The answer to "what does KYRO
charge" is the same sentence in the markup, the structured data and the prose.

---

## What is deliberately not real

| | |
|---|---|
| **Exchange rates** | A fixed table with deterministic per-minute drift, labelled "Preview rate" everywhere. Replace `RateProvider`. |
| **Locations** | Twelve plausible branches in real cities, marked as sample data on every surface. Replace `LocationProvider`. |
| **Network fees** | A sample table. Replace `NetworkFeeProvider`. |
| **KYC decisions** | The status field and the gate are real; no verification provider is integrated, so an operator approves manually. |

Everything else is real: the arithmetic, the ledger, the seeds, the addresses,
the signing, the transactions.

---

## Before this touches real money

It runs on testnet by default and needs both mainnet switches thrown
deliberately. Beyond that:

- A security audit of the custody and ledger paths.
- A gaming licence in every market the games are offered in, and the
  `KYRO_LICENCE_*` variables filled in. Until they are, the games wing shows an
  unlicensed-preview notice on every page.
- Real KYC/AML, and a support service configured in `KYRO_HELPLINE_*`. The
  responsible-play page currently says no service is configured rather than
  printing a helpline that has not been verified for the market.
- A secret manager instead of `.env.local`. The mnemonic controls every deposit
  address KYRO issues.
- Verify the token contract addresses in
  [`src/server/chains/config.ts`](src/server/chains/config.ts) against each
  issuer's own documentation. Crediting a deposit from the wrong contract means
  crediting a worthless token.

---

<div align="center">
<sub>18+ where the games apply. Play within your limits.</sub>
</div>
