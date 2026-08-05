-- ═══════════════════════════════════════════════════════════════════════════
-- Table privileges.
--
-- Supabase's default privileges hand new tables only TRIGGER, REFERENCES and
-- TRUNCATE — not select or insert. Nothing works until the grants below are
-- made explicit, and making them explicit is the right shape anyway: it forces
-- a decision, per role, about what may touch what.
--
--   service_role   full DML. This is the server, and it bypasses RLS.
--   authenticated  select only, filtered by the RLS policies. It can read its
--                  own rows and never write money.
--   anon           nothing at all.
--
-- The consequence worth stating: a leaked anon key grants no database access
-- whatsoever, and a leaked authenticated session can read one user's rows and
-- change nothing.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The server ────────────────────────────────────────────────────────────

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;

-- ── Signed-in users: read their own rows, write nothing ───────────────────

grant select on
  profiles,
  user_limits,
  staff,
  deposit_addresses,
  accounts,
  ledger_transactions,
  ledger_postings,
  deposits,
  withdrawals,
  orders,
  order_events,
  game_rounds,
  seed_pairs
to authenticated;

-- Display name and country are the only things a user may change directly.
-- Every compliance column is additionally defended by the profiles_guard
-- trigger, so a mistake here fails loudly rather than silently.
grant update (display_name, country, self_excluded_until) on profiles to authenticated;

grant select on account_balances to authenticated;
grant select on seed_pairs_public to authenticated;

-- ── Anonymous: nothing ────────────────────────────────────────────────────
--
-- Stated as a revoke rather than an omission so the intent survives someone
-- later loosening the defaults.

revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
