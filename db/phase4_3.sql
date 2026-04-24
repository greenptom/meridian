-- =========================================================================
-- Meridian — Phase 4.3: Jurisdictions as managed reference data
--
-- Extends vat_registrations with first-class identity (uuid), display
-- name, audit timestamps, soft-delete, and a normalised status enum.
-- Adds a jurisdiction_events audit log and a (destination_country,
-- created_at) index on shipments to back the upcoming exposure grid
-- aggregation and the /shipments clickthrough filter.
--
-- Additive migration — nothing is dropped. The old `comment` column
-- is deprecated (app reads from `notes`); it will be removed in a
-- future cleanup migration. The old `registration_date` column is
-- kept too; new code uses `registered_date`.
--
-- Run AFTER db/phase4_1.sql.
-- =========================================================================

-- ---------- 1. Add new columns (idempotent) ----------
alter table vat_registrations
  add column if not exists id uuid default uuid_generate_v4(),
  add column if not exists country_name text,
  add column if not exists notes text,
  add column if not exists registered_date date,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists deleted_at timestamptz;

-- ---------- 2. Backfill id on existing rows ----------
-- Defaults apply to inserts, not existing rows, so populate explicitly.
update vat_registrations set id = uuid_generate_v4() where id is null;

-- ---------- 3. Backfill country_name from country_code ----------
update vat_registrations set country_name = case country_code
  when 'GB' then 'United Kingdom'
  when 'DE' then 'Germany'
  when 'FR' then 'France'
  when 'ES' then 'Spain'
  when 'IT' then 'Italy'
  when 'CZ' then 'Czech Republic'
  when 'PL' then 'Poland'
  else country_code
end
where country_name is null;

-- ---------- 4. Copy comment → notes ----------
-- comment stays in place (deprecated, see NOTES.md); all app code
-- reads/writes via notes from here on.
update vat_registrations set notes = comment
  where notes is null and comment is not null;

-- ---------- 5. Backfill registered_date from registration_date ----------
update vat_registrations set registered_date = registration_date
  where registered_date is null and registration_date is not null;

-- ---------- 6. Normalise status into the enum ----------
-- ES and IT carry the real status in the `comment` column
-- ("Query on hold"). Map those first so the final lowercase sweep
-- doesn't overwrite them.
update vat_registrations set status = 'query_on_hold' where comment = 'Query on hold';
update vat_registrations set status = 'active' where status = 'Active';
-- Any remaining NULL status becomes 'active' (all seeded rows are
-- registered; 'not_registered' only appears on rows the user creates
-- via the new CRUD flow).
update vat_registrations set status = 'active' where status is null;

alter table vat_registrations
  drop constraint if exists vat_registrations_status_check;
alter table vat_registrations
  add constraint vat_registrations_status_check check (
    status in ('active', 'query_on_hold', 'not_registered')
  );

-- ---------- 7. country_name NOT NULL (after backfill) ----------
alter table vat_registrations alter column country_name set not null;

-- ---------- 8. PK swap: country_code → id ----------
alter table vat_registrations alter column id set not null;
alter table vat_registrations drop constraint if exists vat_registrations_pkey;
alter table vat_registrations add primary key (id);
alter table vat_registrations alter column country_code set not null;

-- Partial unique on country_code excluding soft-deleted rows — users
-- can re-add a jurisdiction whose prior row was archived.
create unique index if not exists vat_registrations_country_code_active_idx
  on vat_registrations (country_code) where deleted_at is null;

-- ---------- 9. updated_at trigger ----------
create or replace function set_vat_registrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vat_registrations_set_updated_at on vat_registrations;
create trigger vat_registrations_set_updated_at
  before update on vat_registrations
  for each row execute function set_vat_registrations_updated_at();

-- ---------- 10. RLS: allow writes for authenticated users ----------
drop policy if exists "auth_read_vat" on vat_registrations;
drop policy if exists "auth_all_vat" on vat_registrations;
create policy "auth_all_vat" on vat_registrations
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- 11. jurisdiction_events audit log ----------
-- Dedicated table — polymorphism on shipment_events (via batch_id)
-- was tried in phase 3.3 and left orphaned columns when batches were
-- cut. Keep reference-data events separate to avoid the same fate.
create table if not exists jurisdiction_events (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references vat_registrations(id) on delete cascade,
  type text not null check (type in ('created', 'updated', 'archived', 'restored')),
  summary text,
  changes jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists jurisdiction_events_jurisdiction_idx
  on jurisdiction_events(jurisdiction_id, created_at desc);

alter table jurisdiction_events enable row level security;

drop policy if exists "auth_all_jurisdiction_events" on jurisdiction_events;
create policy "auth_all_jurisdiction_events" on jurisdiction_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- 12. shipments index for destination+date scans ----------
-- Backs the exposure grid aggregation (group by destination within a
-- time window) and the /shipments?destination= clickthrough filter.
create index if not exists shipments_destination_created_idx
  on shipments(destination_country, created_at);
