-- ═══════════════════════════════════════════════════════════════════════════
-- KYRO core schema
--
-- Design rules that the rest of the schema depends on:
--
--   1. Money is never a float and never a bigint. Every amount is
--      numeric(78,0) — an exact integer in the asset's smallest unit, wide
--      enough for a uint256 wei value.
--   2. Balances are never stored. They are the sum of ledger postings, and the
--      only way to change one is to write a balanced transaction.
--   3. Customer-facing tables carry RLS that restricts rows to auth.uid().
--      Writes go through the service role in server code; the browser holds
--      nothing privileged.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enumerations ──────────────────────────────────────────────────────────

create type kyro_chain as enum ('bitcoin', 'ethereum', 'base', 'arbitrum', 'tron', 'solana');
create type kyro_asset as enum ('BTC', 'ETH', 'USDT', 'USDC', 'SOL');
create type kyro_fiat  as enum ('EUR', 'BAM', 'RSD', 'MKD', 'ALL');

create type kyro_direction as enum ('cash-to-crypto', 'crypto-to-cash');

create type kyro_order_status as enum (
  'created', 'identity-confirmed', 'awaiting-funds', 'funds-received',
  'settlement-sent', 'complete', 'cancelled', 'expired'
);

create type kyro_deposit_status as enum (
  'seen',        -- in the mempool or an unconfirmed block
  'confirming',  -- in a block, below the confirmation threshold
  'credited',    -- confirmed and posted to the ledger
  'orphaned',    -- the block that carried it was reorganised away
  'ignored'      -- dust, or an asset we do not credit
);

create type kyro_withdrawal_status as enum (
  'requested', 'awaiting-approval', 'approved', 'broadcast',
  'confirmed', 'rejected', 'failed'
);

create type kyro_kyc_status as enum ('none', 'pending', 'verified', 'rejected');

create type kyro_account_kind as enum (
  'user',                -- a customer's spendable balance
  'house',               -- the operator's own position, incl. game margin
  'hot_wallet',          -- what the signing keys actually control on chain
  'pending_withdrawal',  -- reserved, requested but not yet broadcast
  'network_fee',         -- gas paid out
  'service_fee'          -- the 4% commission
);

-- ── People ────────────────────────────────────────────────────────────────

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  country         text check (country is null or country ~ '^[A-Z]{2}$'),
  -- Compliance gates. All three are enforced server-side before any wager.
  age_confirmed_at    timestamptz,
  kyc_status          kyro_kyc_status not null default 'none',
  kyc_reviewed_at     timestamptz,
  kyc_note            text,
  self_excluded_until timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column profiles.self_excluded_until is
  'While in the future, every games route refuses this user. Cannot be shortened by the user.';

-- Responsible-play limits. Increases take effect after a cooling-off period;
-- decreases apply immediately. Both rules live in server code, enforced here by
-- storing the pending value separately rather than overwriting the live one.
create table user_limits (
  user_id                 uuid primary key references profiles(id) on delete cascade,
  daily_deposit_cap_usd   numeric(78,0),
  daily_loss_cap_usd      numeric(78,0),
  session_minutes         integer check (session_minutes is null or session_minutes > 0),
  pending_increase        jsonb,
  pending_increase_at     timestamptz,
  updated_at              timestamptz not null default now()
);

create table staff (
  user_id    uuid primary key references profiles(id) on delete cascade,
  role       text not null check (role in ('cashier', 'operator', 'admin')),
  created_at timestamptz not null default now()
);

comment on table staff is
  'Membership grants the operator console. Checked server-side on every staff route.';

-- ── Custody ───────────────────────────────────────────────────────────────

-- One derivation index per user per chain, allocated from a sequence so two
-- concurrent requests can never be handed the same address.
create sequence deposit_address_index_seq start 1;

create table deposit_addresses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id) on delete cascade,
  -- Set instead of user_id when the address belongs to an exchange order
  -- created without an account.
  order_reference  text,
  chain            kyro_chain not null,
  address          text not null,
  derivation_index bigint not null,
  created_at       timestamptz not null default now(),

  constraint deposit_address_owner check (
    (user_id is not null) <> (order_reference is not null)
  ),
  unique (chain, address),
  unique (chain, derivation_index)
);

create unique index deposit_addresses_user_chain
  on deposit_addresses (user_id, chain) where user_id is not null;

create unique index deposit_addresses_order
  on deposit_addresses (order_reference) where order_reference is not null;

-- How far the watcher has scanned each chain. One row per chain.
create table chain_cursors (
  chain          kyro_chain primary key,
  last_height    bigint not null default 0,
  last_scanned_at timestamptz,
  updated_at     timestamptz not null default now()
);

-- ── Ledger ────────────────────────────────────────────────────────────────

create table accounts (
  id         uuid primary key default gen_random_uuid(),
  kind       kyro_account_kind not null,
  user_id    uuid references profiles(id) on delete cascade,
  asset      kyro_asset not null,
  created_at timestamptz not null default now(),

  -- A user account is identified by (kind, user_id, asset); a system account by
  -- (kind, asset) with no owner.
  constraint account_owner check (
    (kind = 'user') = (user_id is not null)
  )
);

create unique index accounts_user_asset
  on accounts (kind, user_id, asset) where user_id is not null;
create unique index accounts_system_asset
  on accounts (kind, asset) where user_id is null;

create table ledger_transactions (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  -- The single defence against double-crediting a deposit or double-settling a
  -- bet when a request is retried. Every writer must supply one.
  idempotency_key text not null unique,
  reference_type  text,
  reference_id    text,
  created_at      timestamptz not null default now()
);

create table ledger_postings (
  id             bigserial primary key,
  transaction_id uuid not null references ledger_transactions(id) on delete cascade,
  account_id     uuid not null references accounts(id),
  asset          kyro_asset not null,
  -- Signed. Positive credits the account, negative debits it.
  delta          numeric(78,0) not null,
  created_at     timestamptz not null default now()
);

create index ledger_postings_account on ledger_postings (account_id, created_at desc);
create index ledger_postings_transaction on ledger_postings (transaction_id);

-- The invariant that makes this a ledger rather than a log: within one
-- transaction, every asset's postings must sum to exactly zero. Value is only
-- ever moved, never conjured.
create or replace function assert_ledger_balanced() returns trigger
language plpgsql as $$
declare
  offending record;
begin
  select p.asset, sum(p.delta) as total
    into offending
  from ledger_postings p
  where p.transaction_id = coalesce(new.transaction_id, old.transaction_id)
  group by p.asset
  having sum(p.delta) <> 0
  limit 1;

  if found then
    raise exception
      'Unbalanced ledger transaction %: asset % sums to %, must be 0',
      coalesce(new.transaction_id, old.transaction_id), offending.asset, offending.total
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- Deferred to the end of the statement so a multi-row insert of both legs is
-- judged as a whole rather than after the first leg lands.
create constraint trigger ledger_postings_balanced
  after insert or update or delete on ledger_postings
  deferrable initially deferred
  for each row execute function assert_ledger_balanced();

-- Balances are derived. There is no column to drift out of step.
create view account_balances as
  select
    a.id as account_id,
    a.kind,
    a.user_id,
    a.asset,
    coalesce(sum(p.delta), 0)::numeric(78,0) as balance
  from accounts a
  left join ledger_postings p on p.account_id = a.id
  group by a.id, a.kind, a.user_id, a.asset;

-- ── Chain movements ───────────────────────────────────────────────────────

create table deposits (
  id             uuid primary key default gen_random_uuid(),
  chain          kyro_chain not null,
  asset          kyro_asset not null,
  address        text not null,
  user_id        uuid references profiles(id) on delete set null,
  order_reference text,
  tx_hash        text not null,
  -- Output index for UTXO chains, log index for EVM/Tron, 0 for Solana.
  tx_index       integer not null default 0,
  amount         numeric(78,0) not null check (amount > 0),
  confirmations  integer not null default 0,
  required_confirmations integer not null,
  block_height   bigint,
  status         kyro_deposit_status not null default 'seen',
  credited_transaction_id uuid references ledger_transactions(id),
  first_seen_at  timestamptz not null default now(),
  credited_at    timestamptz,

  -- The idempotency key of the chain itself. A re-scan of the same block can
  -- never produce a second credit.
  unique (chain, tx_hash, tx_index)
);

create index deposits_status on deposits (status, chain);
create index deposits_user on deposits (user_id, first_seen_at desc);

create table withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete set null,
  order_reference text,
  chain          kyro_chain not null,
  asset          kyro_asset not null,
  address        text not null,
  amount         numeric(78,0) not null check (amount > 0),
  network_fee    numeric(78,0),
  status         kyro_withdrawal_status not null default 'requested',
  tx_hash        text,
  failure_reason text,
  requested_at   timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    uuid references profiles(id),
  broadcast_at   timestamptz,
  confirmed_at   timestamptz,
  reserve_transaction_id uuid references ledger_transactions(id),
  settle_transaction_id  uuid references ledger_transactions(id)
);

create index withdrawals_status on withdrawals (status, requested_at);
create index withdrawals_user on withdrawals (user_id, requested_at desc);

-- ── Exchange orders ───────────────────────────────────────────────────────

create table orders (
  reference        text primary key,
  user_id          uuid references profiles(id) on delete set null,
  direction        kyro_direction not null,
  fiat             kyro_fiat not null,
  asset            kyro_asset not null,
  network          kyro_chain not null,

  give_units       numeric(78,0) not null,
  gross_minor      numeric(78,0) not null,
  service_fee_minor numeric(78,0) not null,
  service_fee_bp   integer not null,
  network_fee_base numeric(78,0) not null,
  receive_units    numeric(78,0) not null,
  rate_units       numeric(78,0) not null,

  location_slug    text not null,
  wallet_address   text,
  deposit_address  text,
  email            text,

  status           kyro_order_status not null default 'created',
  tx_hash          text,
  deposit_tx_hash  text,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

create index orders_status on orders (status, created_at desc);
create index orders_email on orders (lower(email));

create table order_events (
  id         bigserial primary key,
  reference  text not null references orders(reference) on delete cascade,
  status     kyro_order_status not null,
  note       text,
  actor      uuid references profiles(id),
  at         timestamptz not null default now()
);

create index order_events_reference on order_events (reference, at);

-- ── Audit ─────────────────────────────────────────────────────────────────

create table audit_log (
  id         bigserial primary key,
  actor      uuid references profiles(id),
  action     text not null,
  subject    text,
  detail     jsonb,
  at         timestamptz not null default now()
);

create index audit_log_at on audit_log (at desc);
