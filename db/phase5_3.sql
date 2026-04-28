-- =========================================================================
-- Meridian — Phase 5.3 (part 1): Reference table schema parity
--
-- Brings hauliers, suppliers, and iors up to the same shape as
-- vat_registrations from phase 4.3:
--   - audit timestamps + soft-delete column (deleted_at)
--   - shared updated_at trigger
--   - partial unique index on name where deleted_at is null
--     (so archiving a haulier doesn't block re-adding the same name)
--   - per-type audit log: haulier_events / supplier_events / ior_events
--   - RLS broadened from read-only to authed full access
--
-- Per-type extras added:
--   hauliers   : country, contact_email, contact_phone, notes
--   suppliers  : commodity_focus  (notes + country already exist)
--   iors       : country, eori_number  (notes + vat_country already exist;
--                 vat_country is the country whose VAT they file in,
--                 country is their entity residency — not the same thing)
--
-- Incoterms is intentionally not touched. It's a closed ICC standard
-- list (11 codes); read-only is the right model.
--
-- Run AFTER db/phase5_1.sql.
-- =========================================================================

-- ---------- 0. Shared updated_at trigger function ----------
create or replace function set_updated_at_now()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================================
-- HAULIERS
-- =========================================================================

alter table hauliers
  add column if not exists country text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists notes text,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Drop the plain unique on name; replace with partial unique excluding
-- soft-deleted rows. Default constraint name in Postgres is {table}_name_key.
alter table hauliers drop constraint if exists hauliers_name_key;

create unique index if not exists hauliers_name_active_idx
  on hauliers(name) where deleted_at is null;

drop trigger if exists hauliers_set_updated_at on hauliers;
create trigger hauliers_set_updated_at
  before update on hauliers
  for each row execute function set_updated_at_now();

create table if not exists haulier_events (
  id uuid primary key default gen_random_uuid(),
  haulier_id uuid not null references hauliers(id) on delete cascade,
  type text not null check (type in ('created', 'updated', 'archived', 'restored')),
  summary text,
  changes jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists haulier_events_haulier_idx
  on haulier_events(haulier_id, created_at desc);

alter table haulier_events enable row level security;
drop policy if exists "auth_all_haulier_events" on haulier_events;
create policy "auth_all_haulier_events" on haulier_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_hauliers" on hauliers;
drop policy if exists "auth_all_hauliers" on hauliers;
create policy "auth_all_hauliers" on hauliers
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =========================================================================
-- SUPPLIERS
-- =========================================================================

alter table suppliers
  add column if not exists commodity_focus text,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table suppliers drop constraint if exists suppliers_name_key;

create unique index if not exists suppliers_name_active_idx
  on suppliers(name) where deleted_at is null;

drop trigger if exists suppliers_set_updated_at on suppliers;
create trigger suppliers_set_updated_at
  before update on suppliers
  for each row execute function set_updated_at_now();

create table if not exists supplier_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  type text not null check (type in ('created', 'updated', 'archived', 'restored')),
  summary text,
  changes jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists supplier_events_supplier_idx
  on supplier_events(supplier_id, created_at desc);

alter table supplier_events enable row level security;
drop policy if exists "auth_all_supplier_events" on supplier_events;
create policy "auth_all_supplier_events" on supplier_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_suppliers" on suppliers;
drop policy if exists "auth_all_suppliers" on suppliers;
create policy "auth_all_suppliers" on suppliers
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =========================================================================
-- IORS
-- =========================================================================

alter table iors
  add column if not exists country text,
  add column if not exists eori_number text,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- iors.name had no unique constraint historically; the partial index
-- below is the first uniqueness guarantee.
create unique index if not exists iors_name_active_idx
  on iors(name) where deleted_at is null;

drop trigger if exists iors_set_updated_at on iors;
create trigger iors_set_updated_at
  before update on iors
  for each row execute function set_updated_at_now();

create table if not exists ior_events (
  id uuid primary key default gen_random_uuid(),
  ior_id uuid not null references iors(id) on delete cascade,
  type text not null check (type in ('created', 'updated', 'archived', 'restored')),
  summary text,
  changes jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists ior_events_ior_idx
  on ior_events(ior_id, created_at desc);

alter table ior_events enable row level security;
drop policy if exists "auth_all_ior_events" on ior_events;
create policy "auth_all_ior_events" on ior_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_iors" on iors;
drop policy if exists "auth_all_iors" on iors;
create policy "auth_all_iors" on iors
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
