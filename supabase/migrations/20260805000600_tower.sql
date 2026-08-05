-- ═══════════════════════════════════════════════════════════════════════════
-- Tower.
--
-- A sixth game. Eight floors, one trapped door per floor, cash out whenever.
-- It settles floor by floor like Mines rather than in one shot, so it reuses
-- the same open/reveal/cash-out shape and needs nothing new beyond the enum
-- value.
-- ═══════════════════════════════════════════════════════════════════════════

alter type kyro_game add value if not exists 'tower';
