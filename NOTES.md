# Engineering notes

## Orphaned DB tables from Phase 3.3

The Phase 3.3 migration (`db/phase3_3.sql`) created a batches / production
trace data layer that was subsequently cut from product scope. The
following schema objects exist in production Supabase but are **not
referenced by any application code**:

- `batches` table (zero rows)
- `shipment_batch_uses` table (zero rows)
- `organisations` table (one seeded row: Grind)
- `shipment_events.batch_id` column + FK
- `shipment_events.payload` column (still useful for future event types)
- `shipment_events` type CHECK values `batch_created`, `batch_used`
- helper functions `shipment_remaining_quantity(uuid)`,
  `batch_blended_cost(uuid)`, `enforce_shipment_batch_use_unit`,
  `set_batches_updated_at`

TODO: these can be safely dropped in a future cleanup migration if we
want to tidy the schema. Order of drops matters — unwind the events
table's `batch_id` FK and `shipment_events_type_check` first, then drop
`shipment_batch_uses`, `batches`, then `organisations` (and their
triggers / helper functions). Leaving them in place is harmless; no
code path writes to them, and the `shipment_events` additions are
non-breaking.
