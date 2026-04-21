-- =========================================================================
-- Meridian — Phase 3.2: landing workflow event types
-- Extends shipment_events.type CHECK with landed / customs_cleared /
-- customs_held. Postgres doesn't support ADD VALUE on a CHECK constraint,
-- so we drop + re-add with the full current list.
-- Run AFTER db/phase3_1.sql.
-- =========================================================================

alter table shipment_events
  drop constraint if exists shipment_events_type_check;

alter table shipment_events
  add constraint shipment_events_type_check check (type in (
    'created',
    'updated',
    'status_changed',
    'document_attached',
    'document_extracted',
    'note_added',
    'landed',
    'customs_cleared',
    'customs_held'
  ));
