-- =========================================================================
-- Meridian — Phase 2 follow-up: relax commodity_code to free text
-- Run this in Supabase SQL editor after db/phase2.sql.
-- =========================================================================

-- Real invoices carry HS codes outside our curated commodity_codes seed list.
-- Keep the column as text so extractions never fail on an unrecognised code;
-- the commodity_codes table stays as a suggestions/autocomplete source, not
-- a hard constraint.

alter table shipments drop constraint if exists shipments_commodity_code_fkey;
