-- =========================================================================
-- Meridian — Phase 5.3 (part 2): Tighten shipments FK cascades
--
-- shipments has had haulier_id / supplier_id / ior_id columns since
-- the original schema, but with `on delete set null` cascade. That
-- silently nulls the FK if a referenced row is hard-deleted, which
-- corrupts the audit trail. Switching to `on delete restrict` so any
-- future hard-delete attempt fails loudly and forces the operator to
-- update referenced shipments first.
--
-- The real day-to-day protection still happens at the application
-- layer: archiveHaulier / archiveSupplier / archiveIor refuse to
-- archive a row that has live shipment references and surface a
-- friendly count-and-fix error. The cascade only matters when
-- someone tries to actually DELETE a row (which v1 doesn't expose
-- anywhere — but the DB-level guard is cheap insurance).
--
-- The legacy free-text columns (haulier_name, supplier_name,
-- ior_name) stay populated as a safety net during the FK transition.
-- A future cleanup migration will drop them once team confidence is
-- high. NOTES.md tracks this debt.
--
-- Migration order:
--   1. phase5_3.sql adds schema parity to the reference tables
--   2. /reference/{type} CRUD lets users populate the reference rows
--   3. npm run reconcile-references retroactively links existing
--      shipments by exact + case-insensitive name match
--   4. THIS migration tightens the FK cascade
--   5. (future) cleanup migration drops the legacy free-text columns
--
-- Run AFTER db/phase5_3.sql, ideally after running the reconciliation
-- script at least once so the FK columns reflect intent.
-- =========================================================================

alter table shipments drop constraint if exists shipments_haulier_id_fkey;
alter table shipments drop constraint if exists shipments_supplier_id_fkey;
alter table shipments drop constraint if exists shipments_ior_id_fkey;

alter table shipments
  add constraint shipments_haulier_id_fkey
  foreign key (haulier_id) references hauliers(id) on delete restrict;

alter table shipments
  add constraint shipments_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete restrict;

alter table shipments
  add constraint shipments_ior_id_fkey
  foreign key (ior_id) references iors(id) on delete restrict;

-- Indexes on the FK columns to keep the archive-precondition count
-- query fast (`select count(*) from shipments where haulier_id = ?`).
create index if not exists shipments_haulier_id_idx
  on shipments(haulier_id) where haulier_id is not null;
create index if not exists shipments_supplier_id_idx
  on shipments(supplier_id) where supplier_id is not null;
create index if not exists shipments_ior_id_idx
  on shipments(ior_id) where ior_id is not null;
