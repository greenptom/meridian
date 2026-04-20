-- =========================================================================
-- Meridian — Phase 2: document upload + Claude extraction
-- Run this in Supabase SQL editor AFTER db/schema.sql.
-- =========================================================================

-- ---------- shipment_documents ----------
-- Uploaded files + the JSON we got back from Claude. shipment_id is nullable
-- because we insert at extraction time (before the user has saved the
-- shipment) and link it once the save happens. Any orphans can be cleaned
-- up with a housekeeping job later.

create table if not exists shipment_documents (
  id uuid primary key default uuid_generate_v4(),
  shipment_id uuid references shipments(id) on delete cascade,
  storage_path text not null,
  filename text,
  mime_type text,
  file_size int,
  extracted_json jsonb,
  extraction_confidence numeric(4, 3),
  extracted_at timestamptz,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists shipment_documents_shipment_idx on shipment_documents(shipment_id);
create index if not exists shipment_documents_created_at_idx on shipment_documents(created_at desc);

alter table shipment_documents enable row level security;

drop policy if exists "auth_all_documents" on shipment_documents;
create policy "auth_all_documents" on shipment_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- storage bucket ----------
-- Private bucket. Files live under `{user_id}/{uuid}.{ext}` so the prefix
-- policy below scopes uploads/reads to the authenticated user's own folder.
-- The API route uses the service-role key to read for extraction.

insert into storage.buckets (id, name, public)
values ('shipment-docs', 'shipment-docs', false)
on conflict (id) do nothing;

-- storage.objects policies — scoped to this bucket only.
drop policy if exists "shipment_docs_insert_own" on storage.objects;
create policy "shipment_docs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shipment-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shipment_docs_select_own" on storage.objects;
create policy "shipment_docs_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shipment-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shipment_docs_delete_own" on storage.objects;
create policy "shipment_docs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'shipment-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
