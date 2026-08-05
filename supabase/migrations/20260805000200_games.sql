-- ═══════════════════════════════════════════════════════════════════════════
-- Games: provably-fair seeds, rounds, and atomic bet settlement.
-- ═══════════════════════════════════════════════════════════════════════════

create type kyro_game as enum ('coin-flip', 'dice', 'mines', 'crash', 'plinko');

create type kyro_round_status as enum ('open', 'settled', 'cancelled');

-- ── Seeds ─────────────────────────────────────────────────────────────────
--
-- The commitment half of provably fair. KYRO publishes sha256(server_seed)
-- before any round is played and reveals server_seed only once the pair is
-- retired — at which point every round played against it can be recomputed by
-- anyone, with no trust in KYRO required.

create table seed_pairs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  server_seed       text not null,
  server_seed_hash  text not null,
  client_seed       text not null,
  nonce             integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  revealed_at       timestamptz
);

-- Exactly one live pair per player.
create unique index seed_pairs_active on seed_pairs (user_id) where is_active;
create index seed_pairs_user on seed_pairs (user_id, created_at desc);

comment on column seed_pairs.server_seed is
  'Never exposed through RLS while is_active. Revealed on rotation, after which the pair can no longer be used.';

-- ── Rounds ────────────────────────────────────────────────────────────────

create table game_rounds (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  game           kyro_game not null,
  seed_pair_id   uuid not null references seed_pairs(id),
  nonce          integer not null,
  server_seed_hash text not null,
  client_seed    text not null,

  asset          kyro_asset not null,
  stake          numeric(78,0) not null check (stake > 0),
  payout         numeric(78,0) not null default 0 check (payout >= 0),
  -- Multiplier at four decimal places: 19800 is 1.98×.
  multiplier     integer not null default 0,
  -- House edge applied, in basis points. Stated on every game page.
  edge_bp        integer not null,

  -- Game-specific configuration and result. Everything needed to recompute the
  -- outcome from the seeds lives here.
  params         jsonb not null default '{}'::jsonb,
  outcome        jsonb,

  status         kyro_round_status not null default 'open',
  stake_transaction_id  uuid references ledger_transactions(id),
  payout_transaction_id uuid references ledger_transactions(id),
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,

  -- A seed pair may never produce the same nonce twice; that would repeat an
  -- outcome and break the fairness guarantee.
  unique (seed_pair_id, nonce)
);

create index game_rounds_user on game_rounds (user_id, created_at desc);
create index game_rounds_game on game_rounds (game, created_at desc);

-- ── Atomic settlement ─────────────────────────────────────────────────────
--
-- Placing a bet checks the balance and writes both ledger legs inside one
-- transaction. Without this, two concurrent requests could each read a
-- sufficient balance and both succeed — the classic double-spend against your
-- own account.

create or replace function place_bet(
  p_user_id          uuid,
  p_asset            kyro_asset,
  p_stake            numeric,
  p_idempotency_key  text,
  p_reference_id     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_account   uuid;
  v_house_account  uuid;
  v_balance        numeric;
  v_transaction_id uuid;
begin
  if p_stake <= 0 then
    raise exception 'Stake must be positive' using errcode = 'check_violation';
  end if;

  -- An earlier attempt that already succeeded returns its transaction rather
  -- than charging the player twice.
  select id into v_transaction_id
  from ledger_transactions where idempotency_key = p_idempotency_key;
  if found then
    return v_transaction_id;
  end if;

  select id into v_user_account
  from accounts where kind = 'user' and user_id = p_user_id and asset = p_asset;
  if not found then
    insert into accounts (kind, user_id, asset) values ('user', p_user_id, p_asset)
    returning id into v_user_account;
  end if;

  select id into v_house_account
  from accounts where kind = 'house' and user_id is null and asset = p_asset;
  if not found then
    insert into accounts (kind, asset) values ('house', p_asset)
    returning id into v_house_account;
  end if;

  -- Lock the player's postings so a concurrent bet cannot read the same
  -- balance. This is the line that makes the check meaningful.
  perform pg_advisory_xact_lock(hashtextextended(v_user_account::text, 0));

  select coalesce(sum(delta), 0) into v_balance
  from ledger_postings where account_id = v_user_account;

  if v_balance < p_stake then
    raise exception 'Insufficient balance: have %, need %', v_balance, p_stake
      using errcode = 'insufficient_privilege';
  end if;

  insert into ledger_transactions (kind, idempotency_key, reference_type, reference_id)
  values ('bet-stake', p_idempotency_key, 'game_round', p_reference_id)
  returning id into v_transaction_id;

  insert into ledger_postings (transaction_id, account_id, asset, delta) values
    (v_transaction_id, v_user_account,  p_asset, -p_stake),
    (v_transaction_id, v_house_account, p_asset,  p_stake);

  return v_transaction_id;
end;
$$;

create or replace function settle_round(
  p_user_id         uuid,
  p_asset           kyro_asset,
  p_payout          numeric,
  p_idempotency_key text,
  p_reference_id    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_account   uuid;
  v_house_account  uuid;
  v_transaction_id uuid;
begin
  select id into v_transaction_id
  from ledger_transactions where idempotency_key = p_idempotency_key;
  if found then
    return v_transaction_id;
  end if;

  -- A losing round has nothing to pay out; the stake already moved to the
  -- house when the bet was placed.
  if p_payout <= 0 then
    return null;
  end if;

  select id into v_user_account
  from accounts where kind = 'user' and user_id = p_user_id and asset = p_asset;
  if not found then
    insert into accounts (kind, user_id, asset) values ('user', p_user_id, p_asset)
    returning id into v_user_account;
  end if;

  select id into v_house_account
  from accounts where kind = 'house' and user_id is null and asset = p_asset;
  if not found then
    insert into accounts (kind, asset) values ('house', p_asset)
    returning id into v_house_account;
  end if;

  insert into ledger_transactions (kind, idempotency_key, reference_type, reference_id)
  values ('bet-payout', p_idempotency_key, 'game_round', p_reference_id)
  returning id into v_transaction_id;

  insert into ledger_postings (transaction_id, account_id, asset, delta) values
    (v_transaction_id, v_house_account, p_asset, -p_payout),
    (v_transaction_id, v_user_account,  p_asset,  p_payout);

  return v_transaction_id;
end;
$$;

revoke all on function place_bet(uuid, kyro_asset, numeric, text, text) from public, anon, authenticated;
revoke all on function settle_round(uuid, kyro_asset, numeric, text, text) from public, anon, authenticated;
