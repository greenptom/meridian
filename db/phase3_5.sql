-- =========================================================================
-- Meridian — Phase 3.5: shipment_category
-- Adds a categorisation column to shipments so the team can filter on
-- what kind of movement it is (coffee, packaging, equipment, etc.).
-- Column is nullable for backward compatibility; a backfill seeds every
-- existing row to 'coffee' which matches the team's actual data.
-- Run AFTER db/phase3_3.sql.
-- =========================================================================

alter table shipments
  add column if not exists shipment_category text;

alter table shipments
  drop constraint if exists shipments_category_check;
alter table shipments
  add constraint shipments_category_check check (
    shipment_category is null
    or shipment_category in (
      'coffee',
      'coffee_roasted',
      'packaging',
      'equipment',
      'supplies',
      'other'
    )
  );

update shipments
  set shipment_category = 'coffee'
  where shipment_category is null;

create index if not exists shipments_category_idx
  on shipments(shipment_category);
