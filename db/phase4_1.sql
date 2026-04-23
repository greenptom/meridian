-- =========================================================================
-- Meridian — Phase 4.1: FX rate infrastructure
-- Adds a fixed rate-to-GBP per shipment, captured at creation time from
-- the ECB daily rate (Frankfurter API). This matches HMRC VAT practice
-- of using invoice-date rates; it is auditable and never revisits.
--
-- Rate source is tracked so we can distinguish automatic lookups from
-- manual overrides and rows that need a human to fill in.
--
--   'frankfurter'  : rate pulled from api.frankfurter.app at save time.
--                    GBP rows also get this value with rate = 1.
--   'manual'       : user typed the rate directly (override path, or
--                    fixed a 'needs_review' row).
--   'needs_review' : lookup failed or edge case hit (weekend, unknown
--                    currency, API error, missing/future/too-old date).
--                    Rate is null; UI prompts the user to set it.
--
-- Forward FX contracts and hedge accounting are explicitly out of scope
-- in v1. If the team buys currency ahead, finance overrides the rate
-- manually at save time or on the record.
--
-- Run AFTER db/phase3_5.sql.
-- =========================================================================

alter table shipments
  add column if not exists fx_rate_to_gbp numeric(10,6);

alter table shipments
  add column if not exists fx_rate_source text;

alter table shipments
  drop constraint if exists shipments_fx_rate_source_check;
alter table shipments
  add constraint shipments_fx_rate_source_check check (
    fx_rate_source is null
    or fx_rate_source in ('frankfurter', 'manual', 'needs_review')
  );

-- Supports the backfill query (scan by currency + created_at) and the
-- future tax-exposure aggregation.
create index if not exists shipments_currency_created_idx
  on shipments(currency, created_at);
