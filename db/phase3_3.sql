-- =========================================================================
-- Meridian — Phase 3.3: batches, shipment uses, events rework
-- Adds the production-trace data model on top of shipments.
-- Run AFTER db/phase3_2a.sql.
-- =========================================================================

-- ---------- organisations ----------
-- Futureproofing for multi-tenancy. Single seeded row ("Grind") with a
-- fixed UUID, referenced as the default on new rows. RLS stays open to
-- any authenticated user — organisation_id sits unused in policies until
-- we genuinely support multi-workspace.

create table if not exists organisations (
  id uuid primary key,
  name text not null unique,
  created_at timestamptz default now()
);

alter table organisations enable row level security;

drop policy if exists "auth_all_organisations" on organisations;
create policy "auth_all_organisations" on organisations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into organisations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Grind')
on conflict (id) do nothing;

-- ---------- batches ----------

create table if not exists batches (
  id uuid primary key default uuid_generate_v4(),
  batch_code text not null unique,
  blend_name text,
  roasted_date date,
  quantity_produced numeric(12, 3),
  quantity_unit text not null,
  notes text,
  organisation_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references organisations(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table batches
  drop constraint if exists batches_quantity_unit_check;
alter table batches
  add constraint batches_quantity_unit_check check (
    quantity_unit in ('kg', 'g', 'lb', 'units', 'pallets', 'containers')
  );

create index if not exists batches_roasted_date_idx on batches(roasted_date desc);
create index if not exists batches_organisation_idx on batches(organisation_id);

alter table batches enable row level security;
drop policy if exists "auth_all_batches" on batches;
create policy "auth_all_batches" on batches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- shipment_batch_uses ----------
-- Each row records "N {unit} of shipment S went into batch B." ON DELETE
-- RESTRICT on shipment_id prevents deleting a shipment that has been
-- consumed; ON DELETE CASCADE on batch_id cleans uses when a batch is
-- deleted. organisation_id defaults to Grind for future multi-tenancy.

create table if not exists shipment_batch_uses (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid not null references shipments(id) on delete restrict,
  batch_id uuid not null references batches(id) on delete cascade,
  quantity_used numeric(12, 3) not null,
  quantity_unit text not null,
  notes text,
  organisation_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references organisations(id),
  created_at timestamptz default now()
);

alter table shipment_batch_uses
  drop constraint if exists shipment_batch_uses_quantity_unit_check;
alter table shipment_batch_uses
  add constraint shipment_batch_uses_quantity_unit_check check (
    quantity_unit in ('kg', 'g', 'lb', 'units', 'pallets', 'containers')
  );

create index if not exists shipment_batch_uses_shipment_idx on shipment_batch_uses(shipment_id);
create index if not exists shipment_batch_uses_batch_idx on shipment_batch_uses(batch_id);

alter table shipment_batch_uses enable row level security;
drop policy if exists "auth_all_shipment_batch_uses" on shipment_batch_uses;
create policy "auth_all_shipment_batch_uses" on shipment_batch_uses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- unit-match enforcement ----------
-- v1 requires matching units between a shipment and any uses drawn from
-- it. Enforced in DB for defence in depth; the UI also validates before
-- submit so users get a friendly error. If the shipment has no quantity
-- unit set yet, uses are blocked outright — the shipment needs to be
-- enriched first.

create or replace function enforce_shipment_batch_use_unit()
returns trigger as $$
declare
  shipment_unit text;
begin
  select quantity_unit into shipment_unit
    from shipments where id = new.shipment_id;

  if shipment_unit is null then
    raise exception 'Shipment % has no quantity_unit; set it before adding a batch use.', new.shipment_id
      using errcode = '22023';
  end if;

  if shipment_unit <> new.quantity_unit then
    raise exception 'Batch use unit (%) does not match shipment unit (%).',
      new.quantity_unit, shipment_unit
      using errcode = '22023';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists shipment_batch_uses_unit_match on shipment_batch_uses;
create trigger shipment_batch_uses_unit_match
  before insert or update on shipment_batch_uses
  for each row execute function enforce_shipment_batch_use_unit();

-- ---------- batches updated_at ----------
-- Keep batches.updated_at current on any update. Matches the pattern
-- already in place on shipments via set_shipment_ref.

create or replace function set_batches_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists batches_set_updated_at on batches;
create trigger batches_set_updated_at
  before update on batches
  for each row execute function set_batches_updated_at();

-- ---------- helpers ----------

create or replace function shipment_remaining_quantity(p_shipment_id uuid)
returns numeric as $$
declare
  q numeric;
  used numeric;
begin
  select quantity into q from shipments where id = p_shipment_id;
  if q is null then return null; end if;

  select coalesce(sum(quantity_used), 0) into used
    from shipment_batch_uses
    where shipment_id = p_shipment_id;

  return q - used;
end;
$$ language plpgsql stable;

-- Strict null semantics: if any source shipment has any of invoice_value,
-- freight_cost, insurance_cost, duty_cost, other_costs null, the blended
-- cost is untrusted and we return null. Otherwise a weighted average by
-- quantity_used (which is guaranteed unit-matched to the shipment).

create or replace function batch_blended_cost(p_batch_id uuid)
returns numeric as $$
declare
  total_cost numeric := 0;
  total_qty numeric := 0;
  r record;
  per_unit numeric;
  shipment_total numeric;
begin
  for r in
    select
      bu.quantity_used,
      s.quantity,
      s.invoice_value,
      s.freight_cost,
      s.insurance_cost,
      s.duty_cost,
      s.other_costs
    from shipment_batch_uses bu
    join shipments s on s.id = bu.shipment_id
    where bu.batch_id = p_batch_id
  loop
    if r.invoice_value is null
       or r.freight_cost is null
       or r.insurance_cost is null
       or r.duty_cost is null
       or r.other_costs is null
       or r.quantity is null
       or r.quantity = 0 then
      return null;
    end if;
    shipment_total := r.invoice_value + r.freight_cost + r.insurance_cost + r.duty_cost + r.other_costs;
    per_unit := shipment_total / r.quantity;
    total_cost := total_cost + (r.quantity_used * per_unit);
    total_qty := total_qty + r.quantity_used;
  end loop;

  if total_qty = 0 then return null; end if;
  return total_cost / total_qty;
end;
$$ language plpgsql stable;

-- ---------- events table rework ----------
-- Unify batch-scope events into shipment_events. Make shipment_id
-- nullable, add batch_id, and require at least one. Add payload jsonb
-- for descriptive event data (distinct from diff-only `changes`). Expand
-- the type CHECK with batch_created / batch_used.

alter table shipment_events
  alter column shipment_id drop not null;

alter table shipment_events
  add column if not exists batch_id uuid references batches(id) on delete cascade,
  add column if not exists payload jsonb;

alter table shipment_events
  drop constraint if exists shipment_events_scope_check;
alter table shipment_events
  add constraint shipment_events_scope_check check (
    shipment_id is not null or batch_id is not null
  );

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
    'batch_used'
  ));

create index if not exists shipment_events_batch_idx
  on shipment_events(batch_id, created_at desc);
