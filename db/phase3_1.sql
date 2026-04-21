-- =========================================================================
-- Meridian — Phase 3.1: shipment enrichment
-- Adds PO, quantity, landing dates, customs status, and landed-cost
-- components to shipments. All columns nullable so existing rows remain
-- valid. Run AFTER db/phase2_1.sql.
-- =========================================================================

alter table shipments
  add column if not exists po_number text,
  add column if not exists quantity numeric(12, 3),
  add column if not exists quantity_unit text,
  add column if not exists expected_landed_date date,
  add column if not exists actual_landed_date date,
  add column if not exists customs_status text,
  add column if not exists freight_cost numeric(14, 2),
  add column if not exists insurance_cost numeric(14, 2),
  add column if not exists duty_cost numeric(14, 2),
  add column if not exists other_costs numeric(14, 2);

alter table shipments
  drop constraint if exists shipments_quantity_unit_check;
alter table shipments
  add constraint shipments_quantity_unit_check check (
    quantity_unit is null
    or quantity_unit in ('kg', 'g', 'lb', 'units', 'pallets', 'containers')
  );

alter table shipments
  drop constraint if exists shipments_customs_status_check;
alter table shipments
  add constraint shipments_customs_status_check check (
    customs_status is null
    or customs_status in ('not_started', 'in_progress', 'cleared', 'held')
  );

create index if not exists shipments_actual_landed_idx
  on shipments(actual_landed_date);

create index if not exists shipments_customs_status_idx
  on shipments(customs_status);
