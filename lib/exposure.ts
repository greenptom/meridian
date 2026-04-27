// Pure aggregation: shipments + jurisdictions → grid rows + KPIs.
//
// Lives in lib/ (not actions/) because there's no Supabase work — the
// page does the fetch, this module turns the rows into the dashboard
// shape. Easy to unit-test in isolation if we ever add a runner.

import { canonicalCountry } from "@/lib/countries";
import type { Jurisdiction, JurisdictionStatus, Shipment } from "@/lib/types";

export type ExposureRow = {
  countryCode: string;
  countryName: string;
  // null when this row is a synthetic "unregistered destination" row.
  registration: Jurisdiction | null;
  // Effective status pill: real registration status, or 'no_registration'
  // for the synthetic case.
  pillStatus: JurisdictionStatus | "no_registration";
  shipmentCount: number;
  totalLandedGbp: number; // null fx rates contribute 0 — see below
  flagCount: number;
};

export type ExposureKpis = {
  totalExposureGbp: number;
  jurisdictionsWithShipments: number;
  flaggedShipments: number;
  unregisteredDestinations: number;
};

// Narrow column set we actually need from the shipments table.
export type ExposureShipment = Pick<
  Shipment,
  | "id"
  | "destination_country"
  | "status"
  | "customs_status"
  | "fx_rate_source"
  | "flags"
  | "invoice_value"
  | "freight_cost"
  | "insurance_cost"
  | "duty_cost"
  | "other_costs"
  | "fx_rate_to_gbp"
  | "created_at"
>;

// Critical business rule: a shipment with null fx_rate_to_gbp
// (needs_review) cannot have its landed GBP computed. Such shipments
// are EXCLUDED from totalLandedGbp / totalExposureGbp but are still
// counted in shipmentCount and flagCount (they exist; they are
// already flagged via fx_rate_source = 'needs_review'). The dashboard
// surfaces a footnote so finance doesn't wonder why totals don't
// match shipment counts.
function landedGbp(s: ExposureShipment): number | null {
  if (s.fx_rate_to_gbp == null || s.invoice_value == null) return null;
  const native =
    s.invoice_value +
    (s.freight_cost ?? 0) +
    (s.insurance_cost ?? 0) +
    (s.duty_cost ?? 0) +
    (s.other_costs ?? 0);
  return native * s.fx_rate_to_gbp;
}

export function isShipmentFlagged(
  s: ExposureShipment,
  registeredCodes: ReadonlySet<string>,
): boolean {
  if (s.status === "alert") return true;
  if (s.customs_status === "held") return true;
  if (s.fx_rate_source === "needs_review") return true;
  if ((s.flags?.length ?? 0) > 0) return true;
  const code = canonicalCountry(s.destination_country);
  if (!code || !registeredCodes.has(code)) return true;
  return false;
}

export function aggregateExposure(
  shipments: ReadonlyArray<ExposureShipment>,
  jurisdictions: ReadonlyArray<Jurisdiction>,
): { rows: ExposureRow[]; kpis: ExposureKpis } {
  const activeJurisdictions = jurisdictions.filter((j) => !j.deleted_at);
  const registeredCodes = new Set(activeJurisdictions.map((j) => j.country_code));

  const byCode = new Map<string, ExposureRow>();

  // Seed with every active jurisdiction at zero — they appear even
  // when no shipments hit them in the window.
  for (const j of activeJurisdictions) {
    byCode.set(j.country_code, {
      countryCode: j.country_code,
      countryName: j.country_name,
      registration: j,
      pillStatus: j.status,
      shipmentCount: 0,
      totalLandedGbp: 0,
      flagCount: 0,
    });
  }

  let totalExposureGbp = 0;
  let flaggedShipments = 0;
  const unregisteredCodes = new Set<string>();

  for (const s of shipments) {
    const code = canonicalCountry(s.destination_country) ?? "UNKNOWN";
    const isRegistered = registeredCodes.has(code);
    if (!isRegistered) unregisteredCodes.add(code);

    let row = byCode.get(code);
    if (!row) {
      row = {
        countryCode: code,
        countryName: s.destination_country?.trim() || code,
        registration: null,
        pillStatus: "no_registration",
        shipmentCount: 0,
        totalLandedGbp: 0,
        flagCount: 0,
      };
      byCode.set(code, row);
    }

    row.shipmentCount += 1;
    const gbp = landedGbp(s);
    if (gbp != null) {
      row.totalLandedGbp += gbp;
      totalExposureGbp += gbp;
    }
    if (isShipmentFlagged(s, registeredCodes)) {
      row.flagCount += 1;
      flaggedShipments += 1;
    }
  }

  const rows = [...byCode.values()].sort(
    (a, b) =>
      b.totalLandedGbp - a.totalLandedGbp ||
      a.countryName.localeCompare(b.countryName),
  );

  const kpis: ExposureKpis = {
    totalExposureGbp,
    jurisdictionsWithShipments: rows.filter((r) => r.shipmentCount > 0).length,
    flaggedShipments,
    unregisteredDestinations: unregisteredCodes.size,
  };

  return { rows, kpis };
}

// Unicode regional-indicator flag emoji from a 2-letter alpha-2 code.
// Falls back to empty string if the code isn't 2 letters.
export function flagEmoji(code: string): string {
  const c = code.toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return "";
  const codePoints = [...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}
