-- =========================================================================
-- Meridian — Phase 1 schema
-- Run this in Supabase SQL editor (paste whole file, click Run).
-- =========================================================================

-- ---------- extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- reference tables ----------

create table if not exists incoterms (
  code text primary key,
  full_name text not null,
  delivery_point text,
  risk_transfer text,
  cost_responsibility text
);

create table if not exists commodity_codes (
  code text primary key,
  product_type text not null,
  tariff_description text
);

create table if not exists vat_registrations (
  country_code text primary key,
  registration_type text,
  registration_date date,
  vat_number text,
  managed_by_avask boolean default false,
  filing_period text,
  status text,
  comment text
);

create table if not exists hauliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  primary_purpose text,
  applicable_products text,
  typical_incoterms text
);

create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  country text,
  default_incoterm text references incoterms(code),
  notes text
);

create table if not exists iors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  scenario_type text,
  vat_country text,
  notes text
);

-- ---------- transactional ----------

create table if not exists shipments (
  id uuid primary key default uuid_generate_v4(),
  ref text unique not null,
  origin_country text,
  destination_country text,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,   -- denormalised for display speed
  haulier_id uuid references hauliers(id) on delete set null,
  haulier_name text,
  incoterm text references incoterms(code),
  commodity_code text references commodity_codes(code),
  product_type text,
  invoice_value numeric(14, 2),
  currency text default 'GBP',
  ior_id uuid references iors(id) on delete set null,
  ior_name text,
  reason text,
  status text not null default 'draft' check (status in ('draft','active','review','alert','archived')),
  flags text[] default '{}'::text[],
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists shipments_status_idx on shipments(status);
create index if not exists shipments_destination_idx on shipments(destination_country);
create index if not exists shipments_created_at_idx on shipments(created_at desc);

-- ---------- auto-generated ref ----------
-- Format: MRD-0001, MRD-0002, ...
create sequence if not exists shipment_ref_seq start 1;

create or replace function set_shipment_ref()
returns trigger as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := 'MRD-' || lpad(nextval('shipment_ref_seq')::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shipments_set_ref on shipments;
create trigger shipments_set_ref
before insert or update on shipments
for each row execute function set_shipment_ref();

-- ---------- Row Level Security ----------
-- v1: any authenticated user can do everything (single workspace of 2–5 users).
-- When we add multi-workspace in v2, we tighten these.

alter table shipments enable row level security;
alter table hauliers enable row level security;
alter table suppliers enable row level security;
alter table iors enable row level security;
alter table vat_registrations enable row level security;
alter table incoterms enable row level security;
alter table commodity_codes enable row level security;

drop policy if exists "auth_all_shipments" on shipments;
create policy "auth_all_shipments" on shipments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_hauliers" on hauliers;
create policy "auth_read_hauliers" on hauliers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_suppliers" on suppliers;
create policy "auth_read_suppliers" on suppliers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_iors" on iors;
create policy "auth_read_iors" on iors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_vat" on vat_registrations;
create policy "auth_read_vat" on vat_registrations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_read_incoterms" on incoterms;
create policy "auth_read_incoterms" on incoterms
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth_read_cc" on commodity_codes;
create policy "auth_read_cc" on commodity_codes
  for select using (auth.role() = 'authenticated');
