# Engineering notes

## FX rate modelling

Every non-GBP shipment stores a **fixed** GBP conversion rate
(`fx_rate_to_gbp`) captured at creation time from Frankfurter
(`api.frankfurter.app`, ECB daily rates, no API key). This matches
HMRC VAT practice of using invoice-date rates — auditable, never
revisited.

`fx_rate_source` distinguishes how the number got there:

- `frankfurter` — automatic lookup at save time (GBP rows also get this
  with rate = 1 for consistency)
- `manual` — user typed it in (override link in intake modal, or
  filling in a needs_review row later)
- `needs_review` — lookup failed: weekend/holiday (Frankfurter serves
  the previous business day's rate — we detect it by comparing the
  response `date` to what we asked for), unknown currency (KES, ETB,
  COP, VND and similar aren't on ECB's list), future-dated row,
  row older than 10 years, API error, or timeout. Rate is null;
  the UI prompts the user to set it manually.

**Deliberately out of scope** for v1: forward FX contracts, hedge
accounting, dynamic rate lookups. If the team buys currency ahead,
finance adjusts via the manual override. We can add support later if
the pattern becomes load-bearing; don't build for it speculatively.

### Legacy free-text columns on `shipments`

As of phase 5.3, shipments use FK columns (`haulier_id`,
`supplier_id`, `ior_id`) for reference data. The legacy free-text
columns (`haulier_name`, `supplier_name`, `ior_name`) remain
populated alongside as a safety net:

- Extraction can still write a tentative free-text value when the
  scanned name doesn't match any reference row (UI surfaces this as
  "Not in reference list — Add it")
- The /archive table view can render historic shipments without an
  expensive JOIN
- A correction path exists if the FK linkage ever proves wrong
- haulier_name / supplier_name / ior_name lazily sync from the
  reference table on next shipment save (via resolveRefNames in
  lib/actions/shipments.ts). A reference rename will fire
  "Updated <Field>" audit events tied to whoever next saved each
  shipment, not the actor who renamed the ref. Acceptable trade-off;
  eager backfill considered out of scope for v1.

App code reads from the FK + JOIN by default. The free-text
columns are write-also-read-fallback. Plan to drop them in a
future cleanup migration once team confidence is high; don't
remove until the legacy import path is fully retired.

The shipments FKs use `on delete restrict` (since phase 5.3a) so
any direct DELETE on a referenced reference row fails loudly. The
day-to-day protection is application-level: archive actions check
for live references and refuse with a friendly count.

### Deprecated column: `vat_registrations.comment`

As of phase 4.3, the `comment` column on `vat_registrations` is
deprecated. App code reads and writes via `notes` only. The migration
copies existing `comment` values into `notes` and leaves the old
column in place to avoid a disruptive rename. Schedule it for
removal in a future cleanup migration once nothing reads from it.

---

Backfill: `npm run backfill-fx` processes any row where
`fx_rate_to_gbp IS NULL`. Idempotent. Uses the Supabase service role
(RLS bypassed by design — admin-only script). Keep the inlined FX
logic in `scripts/backfill-fx-rates.mjs` in sync with
`lib/fx/frankfurter.ts` if either changes.



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
