-- =========================================================================
-- Meridian — Phase 5.1: Archive workflow (two-step lifecycle)
--
-- The mental model:
--   Operational repository (/shipments, /drafts) holds shipments that
--   are still being worked on, regardless of how far through the
--   lifecycle they are. Closed-but-not-yet-filed counts as operational.
--
--   Filed repository (/archive) holds shipments that have been formally
--   put away. archived_at is the authoritative "is this filed?" signal.
--
-- The two-step transition:
--   1. closeShipment    : status active|review → status='closed'.
--                         Stays in /shipments. archived_at unchanged.
--   2. archiveShipment  : status='closed'      → archived_at=now().
--                         Status stays 'closed'. Moves to /archive.
--
-- Status enum evolution (additive, no breaking change):
--   Before: draft, active, review, alert, archived
--   After:  draft, active, review, alert, archived, closed
--
-- 'archived' stays in the enum for backward compat — pre-migration rows
-- with status='archived' are valid. They get archived_at set during
-- backfill below so they appear in /archive correctly. The application
-- only writes 'closed' going forward; restoreShipment() lazily
-- normalises a legacy 'archived' status to 'closed' on its way out of
-- the archive, so the legacy/new split self-heals without a separate
-- data migration.
--
-- Run AFTER db/phase4_3.sql.
-- =========================================================================

-- ---------- 1. Extend shipments.status CHECK with 'closed' ----------
alter table shipments
  drop constraint if exists shipments_status_check;
alter table shipments
  add constraint shipments_status_check check (
    status in ('draft', 'active', 'review', 'alert', 'archived', 'closed')
  );

-- ---------- 2. archived_at column (nullable) ----------
alter table shipments
  add column if not exists archived_at timestamptz;

-- ---------- 3. Backfill archived_at for legacy archived rows ----------
-- updated_at is the closest signal we have for "when filed". Pre-trigger
-- rows might lack one, in which case fall back to created_at so the row
-- still surfaces in /archive.
update shipments
  set archived_at = coalesce(updated_at, created_at)
  where status = 'archived' and archived_at is null;

-- ---------- 4. Index for the /archive view's primary scan ----------
create index if not exists shipments_archived_at_idx
  on shipments(archived_at desc) where archived_at is not null;

-- ---------- 5. Extend shipment_events.type with archived / restored ----------
-- The existing 'status_changed' covers active|review → closed; the new
-- types specifically track filing/unfiling so audit history can show
-- the two-step lifecycle clearly.
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
    'customs_held',
    'batch_created',
    'batch_used',
    'archived',
    'restored'
  ));
