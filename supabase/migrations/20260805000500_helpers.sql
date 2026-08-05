-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers the server calls by name.
-- ═══════════════════════════════════════════════════════════════════════════

-- Allocating a derivation index has to be atomic. Two requests handed the same
-- index would derive the same address for two different customers, and their
-- money would arrive in one place with no way to tell whose was whose. A
-- sequence is the one primitive that cannot be raced.
create or replace function next_deposit_index() returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('deposit_address_index_seq');
$$;

revoke all on function next_deposit_index() from public, anon, authenticated;
grant execute on function next_deposit_index() to service_role;

-- Rolling 24-hour withdrawal total for one user, in the asset's base units.
-- Used to enforce the daily cap before a withdrawal is accepted.
create or replace function withdrawn_last_24h(p_user_id uuid, p_asset kyro_asset)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric
  from withdrawals
  where user_id = p_user_id
    and asset = p_asset
    and status in ('requested', 'awaiting-approval', 'approved', 'broadcast', 'confirmed')
    and requested_at > now() - interval '24 hours';
$$;

revoke all on function withdrawn_last_24h(uuid, kyro_asset) from public, anon;
grant execute on function withdrawn_last_24h(uuid, kyro_asset) to service_role;

-- The reconciliation figure the operator console shows: what KYRO owes
-- customers, per asset. Compared against the hot wallet's real on-chain balance
-- to prove the two have not drifted apart.
create or replace function customer_liabilities()
returns table (asset kyro_asset, owed numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.asset, coalesce(sum(p.delta), 0)::numeric as owed
  from ledger_postings p
  join accounts a on a.id = p.account_id
  where a.kind in ('user', 'pending_withdrawal')
  group by p.asset;
$$;

revoke all on function customer_liabilities() from public, anon, authenticated;
grant execute on function customer_liabilities() to service_role;
