import { createClient } from "@/lib/supabase/server";
import { aggregateExposure, type ExposureShipment } from "@/lib/exposure";
import {
  availableYears,
  parseTimeWindowParams,
  resolveTimeWindow,
} from "@/lib/time-window";
import type { Jurisdiction } from "@/lib/types";
import { ExposureView } from "@/components/exposure/exposure-view";

export const dynamic = "force-dynamic";

export default async function ExposurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }

  const selection = parseTimeWindowParams(flat);
  const window = resolveTimeWindow(selection);

  // Filed toggle: ON by default. ?filed=0 excludes filed shipments
  // (archived_at IS NOT NULL). SQL-level behaviour: when OFF, restrict
  // to archived_at IS NULL.
  //
  // Backwards compat: ?archived=0 from the previous phase still maps to
  // the same effect. ?filed wins when both are present. Drop the alias
  // in a future phase once we're sure no one's relying on it.
  const includeFiled =
    flat.filed != null ? flat.filed !== "0" : flat.archived !== "0";

  const supabase = await createClient();

  // Pull the years list across all shipments for the year dropdown,
  // independent of the current window. Cheap — one column.
  const yearsQuery = supabase
    .from("shipments")
    .select("created_at");

  // Main shipments query — narrow column set, scoped to the window.
  let shipmentsQuery = supabase
    .from("shipments")
    .select(
      "id, destination_country, status, customs_status, fx_rate_source, flags, " +
        "invoice_value, freight_cost, insurance_cost, duty_cost, other_costs, " +
        "fx_rate_to_gbp, created_at",
    );
  if (window.from) {
    shipmentsQuery = shipmentsQuery.gte(
      "created_at",
      window.from.toISOString(),
    );
  }
  if (window.to) {
    shipmentsQuery = shipmentsQuery.lt("created_at", window.to.toISOString());
  }
  if (!includeFiled) {
    shipmentsQuery = shipmentsQuery.is("archived_at", null);
  }

  const jurisdictionsQuery = supabase
    .from("vat_registrations")
    .select(
      "id, country_code, country_name, vat_number, status, registered_date, notes, registration_type, managed_by_avask, filing_period, deleted_at, created_at, updated_at",
    )
    .is("deleted_at", null);

  const [allYearsRes, shipmentsRes, jurisdictionsRes] = await Promise.all([
    yearsQuery,
    shipmentsQuery,
    jurisdictionsQuery,
  ]);

  const allYears = (allYearsRes.data ?? []) as unknown as { created_at: string }[];
  const shipments = (shipmentsRes.data ?? []) as unknown as ExposureShipment[];
  const jurisdictions = (jurisdictionsRes.data ?? []) as unknown as Jurisdiction[];

  const { rows, kpis } = aggregateExposure(shipments, jurisdictions);
  const years = availableYears(allYears.map((y) => y.created_at));

  return (
    <ExposureView
      rows={rows}
      kpis={kpis}
      totalShipments={shipments.length}
      windowLabel={window.label}
      selection={selection}
      years={years}
      includeFiled={includeFiled}
    />
  );
}
