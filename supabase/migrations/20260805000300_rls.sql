-- ═══════════════════════════════════════════════════════════════════════════
-- Row-level security.
--
-- Posture: every table is locked by default. A signed-in user may read their
-- own rows and almost nothing else. No policy anywhere grants a client the
-- ability to write money — deposits, withdrawals, ledger rows, orders and game
-- rounds are written exclusively by server code holding the service role, which
-- bypasses RLS by design.
--
-- The practical consequence: leaking the anon key exposes nothing beyond what
-- the signed-in user could already see.
-- ═══════════════════════════════════════════════════════════════════════════

alter table profiles           enable row level security;
alter table user_limits        enable row level security;
alter table staff              enable row level security;
alter table deposit_addresses  enable row level security;
alter table chain_cursors      enable row level security;
alter table accounts           enable row level security;
alter table ledger_transactions enable row level security;
alter table ledger_postings    enable row level security;
alter table deposits           enable row level security;
alter table withdrawals        enable row level security;
alter table orders             enable row level security;
alter table order_events       enable row level security;
alter table audit_log          enable row level security;
alter table seed_pairs         enable row level security;
alter table game_rounds        enable row level security;

-- Staff membership, as a function so policies stay readable. security definer
-- so the lookup itself is not blocked by staff's own policy.
create or replace function is_staff(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = p_user_id);
$$;

-- ── Profile ───────────────────────────────────────────────────────────────

create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- A user may edit their display name and country. Every compliance column is
-- protected by the trigger below rather than by column privileges, so an
-- attempted change fails loudly instead of being silently dropped.
create policy "update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function guard_profile_columns() returns trigger
language plpgsql as $$
begin
  -- The service role legitimately changes these; a user never may.
  if current_setting('request.jwt.claims', true) is null
     or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.kyc_status is distinct from old.kyc_status
     or new.age_confirmed_at is distinct from old.age_confirmed_at
     or new.kyc_reviewed_at is distinct from old.kyc_reviewed_at then
    raise exception 'Compliance fields cannot be changed directly'
      using errcode = 'insufficient_privilege';
  end if;

  -- Self-exclusion may be set or extended, never shortened or removed. This is
  -- the whole point of the mechanism.
  if old.self_excluded_until is not null
     and (new.self_excluded_until is null or new.self_excluded_until < old.self_excluded_until) then
    raise exception 'Self-exclusion cannot be shortened'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on profiles
  for each row execute function guard_profile_columns();

-- ── Limits ────────────────────────────────────────────────────────────────

create policy "read own limits" on user_limits
  for select using (auth.uid() = user_id);

-- ── Staff ─────────────────────────────────────────────────────────────────

create policy "read own staff row" on staff
  for select using (auth.uid() = user_id);

-- ── Custody ───────────────────────────────────────────────────────────────

create policy "read own deposit addresses" on deposit_addresses
  for select using (auth.uid() = user_id);

-- chain_cursors: no policy at all. Watcher-only, service role.

-- ── Ledger ────────────────────────────────────────────────────────────────

create policy "read own accounts" on accounts
  for select using (auth.uid() = user_id);

create policy "read own postings" on ledger_postings
  for select using (
    exists (
      select 1 from accounts a
      where a.id = ledger_postings.account_id and a.user_id = auth.uid()
    )
  );

create policy "read own transactions" on ledger_transactions
  for select using (
    exists (
      select 1
      from ledger_postings p
      join accounts a on a.id = p.account_id
      where p.transaction_id = ledger_transactions.id and a.user_id = auth.uid()
    )
  );

-- ── Chain movements ───────────────────────────────────────────────────────

create policy "read own deposits" on deposits
  for select using (auth.uid() = user_id);

create policy "read own withdrawals" on withdrawals
  for select using (auth.uid() = user_id);

-- ── Orders ────────────────────────────────────────────────────────────────
--
-- Exchange orders are deliberately account-free: they are looked up by their
-- code through server code, not by the browser. A signed-in user additionally
-- sees the orders attached to their account.

create policy "read own orders" on orders
  for select using (auth.uid() is not null and auth.uid() = user_id);

create policy "read own order events" on order_events
  for select using (
    exists (
      select 1 from orders o
      where o.reference = order_events.reference and o.user_id = auth.uid()
    )
  );

-- ── Games ─────────────────────────────────────────────────────────────────

create policy "read own rounds" on game_rounds
  for select using (auth.uid() = user_id);

-- Seed pairs are readable by their owner, but the live server seed must not be
-- among the columns returned. A view exposes the safe shape; the base table
-- gets no select policy at all.
create policy "read own retired seeds" on seed_pairs
  for select using (auth.uid() = user_id and is_active = false);

create view seed_pairs_public
with (security_invoker = true)
as
  select
    id, user_id, server_seed_hash, client_seed, nonce, is_active,
    created_at, revealed_at,
    case when is_active then null else server_seed end as server_seed
  from seed_pairs;

comment on view seed_pairs_public is
  'The shape a player may see: the hash always, the seed itself only once the pair is retired.';

-- ── Audit ─────────────────────────────────────────────────────────────────
-- No policy. Service role only.

-- ── Grants ────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated;
grant select on account_balances to authenticated;
grant select on seed_pairs_public to authenticated;
