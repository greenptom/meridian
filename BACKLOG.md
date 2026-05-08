# Backlog

Deferred items, known gaps, and future-phase ideas. Not a roadmap — a holding
area for things we've decided not to do *now* so they don't get lost.

Items move out of here in three ways: into a phase plan when they're scheduled,
into NOTES.md when they're done, or struck through when we decide they're not
worth doing.

---

## UX refinements

### Archived-shipment banner — copy and styling tweaks
Status: deferred (Phase 5.3 testing, 2026-05-08)
Source: 5c.2.1 hotfix preview test pass.
The banner ships in a working state. Specific tweaks not yet captured —
revisit when doing a wider UX polish pass.

### IOR detail subscript: consider swapping EORI for VAT number once schema gains the field
Status: deferred (no phase assigned)
Source: 5c.3 plan discussion.
The detail panel's IOR subscript currently shows `vat_country · eori_number`.
VAT number would be the more universally relevant identifier for an IOR
across jurisdictions (EU + post-Brexit UK); EORI is customs-specific. The
`iors` schema doesn't have a `vat_number` column today — add it before
swapping the subscript field.

---

## Data model gaps

### Multi-line invoice / PO handling
Status: deferred (Phase 6+)
Source: Test 7 PDF upload (CRL Foods invoice, MRD-0026).
The `shipments` table has a single `quantity`, `product`, and `invoice_value`
per row. When a PDF contains multiple line items (e.g. an invoice with two
distinct products on different pallets), extraction collapses them into a
single shipment by summing quantities. This is a data model decision, not a
bug: should multi-line invoices create one shipment with summed totals, or
multiple shipments (one per line)? Worth a deliberate Phase 6 conversation
before any code change.

### Supplier / haulier / IOR name normalisation and aliasing
Status: deferred (Phase 6+)
Source: Test 7 PDF upload — extraction returned "CRL Foods Ltd t/a Inovocan",
which didn't match the existing "CRL" reference row, so the user had to add
it as a new row. Reference list now has both "CRL" and "CRL Foods Ltd t/a
Inovocan" representing the same legal entity.
Real-world supplier names come in legal, trading, and short forms with
varying punctuation, suffixes (Ltd, GmbH, Ltda.), and trading-as constructs.
Without normalisation or aliasing, the reference list will accumulate
duplicates. Options to consider in Phase 6:
- A canonical-name + aliases model on each reference row
- A merge-references workflow for cleaning up duplicates after the fact
- Fuzzy matching (with explicit user confirmation) on extraction

---

## Audit and history

### Pre-audit-log shipment event backfill
Status: deferred (no phase assigned)
Source: Test 1 follow-up — MRD-0002 has zero rows in `shipment_events`
despite being a real production shipment.
Some shipments (likely those seeded directly via SQL or only ever touched
via the reconciliation script) have no event history. This isn't a bug in
the audit logging itself — events are firing correctly for normal user
edits. It's a gap in retroactive coverage. Worth a one-off backfill or an
explicit decision to accept the gap. Low priority; cosmetic for now.

---

## Performance

### Bundle size: reference data on /archive
Status: deferred (Phase 7 bundle pass)
Source: 5c.2 review — bundle grew 188 → 192 kB on /shipments, /drafts,
/archive after combobox + inner-modal client code landed.
/archive loads the full haulier/supplier/IOR reference data even though
archived shipments are rarely edited. ~4 kB of waste on a route most viewers
won't use the intake modal on. Possible mitigation: lazy-load the intake
modal entirely on routes that don't immediately need it. Not enough to act
on now; the data flow consistency has its own value. Revisit during a
deliberate bundle-size pass.
