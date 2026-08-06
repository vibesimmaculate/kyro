-- Wheel joins the games enum.
--
-- `ADD VALUE` cannot run inside a transaction block on older servers, and
-- Supabase wraps migrations in one, so `IF NOT EXISTS` is what makes this safe
-- to re-run rather than a guard against concurrency.
ALTER TYPE kyro_game ADD VALUE IF NOT EXISTS 'wheel';
