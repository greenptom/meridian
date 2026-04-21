-- =========================================================================
-- Meridian — Phase 3.2a: forbid "landed without quantity"
-- Landed cost per unit is incoherent without a quantity, so we block the
-- state at the DB level as well as in the UI. Named constraint so it's
-- droppable later if policy changes. Idempotent.
-- Run AFTER db/phase3_2.sql.
-- =========================================================================

alter table shipments
  drop constraint if exists shipments_landed_requires_quantity;

alter table shipments
  add constraint shipments_landed_requires_quantity check (
    actual_landed_date is null or quantity is not null
  );
