-- =========================================================================
-- Meridian — Phase 2.1: shipment audit events
-- Run this in Supabase SQL editor AFTER db/phase2.sql.
-- =========================================================================

-- ---------- shipment_events ----------
-- Append-only audit log. `type` is a plain text column with a CHECK
-- constraint rather than a Postgres enum so we can add new event types
-- later without an ALTER TYPE migration. `changes` holds only the fields
-- that actually changed on an edit (old/new per field) — never the whole
-- row — so the log stays readable.

create table if not exists shipment_events (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  type text not null check (type in (
    'created',
    'updated',
    'status_changed',
    'document_attached',
    'document_extracted',
    'note_added'
  )),
  summary text,
  changes jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists shipment_events_shipment_idx
  on shipment_events(shipment_id, created_at desc);

alter table shipment_events enable row level security;

drop policy if exists "auth_all_events" on shipment_events;
create policy "auth_all_events" on shipment_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
