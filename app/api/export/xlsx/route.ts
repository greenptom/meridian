import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  FX_RATE_SOURCE_LABELS,
  SHIPMENT_CATEGORY_LABELS,
  type Shipment,
} from "@/lib/types";

// exceljs needs Node APIs (Buffer, streams, zlib). Being explicit avoids
// a silent failure if Next ever decides to try the Edge runtime here.
export const runtime = "nodejs";
export const maxDuration = 60;

// Streaming note: at this scale writeBuffer() is fine. If rows grow past
// ~50k consider workbook.xlsx.write(stream) with a ReadableStream response
// body so we don't hold the whole buffer in memory.
//
// writeBuffer() returns a Node Buffer under the "nodejs" runtime (not a
// browser ArrayBuffer — the type signature says ArrayBuffer but the
// actual object is a Node Buffer, which the Response constructor accepts
// directly as BodyInit).

const CUSTOMS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  cleared: "Cleared",
  held: "Held",
};

const STATUS_LABEL: Record<Shipment["status"], string> = {
  draft: "Draft",
  active: "Active",
  review: "Review",
  alert: "Flag",
  closed: "Closed",
  archived: "Archived",
};

type ColumnSpec = {
  header: string;
  width?: number;
  numFmt?: string;
};

const COLUMNS: ColumnSpec[] = [
  { header: "Ref" },
  { header: "Status" },
  { header: "Category" },
  { header: "Origin" },
  { header: "Destination" },
  { header: "Supplier" },
  { header: "Haulier" },
  { header: "Incoterm" },
  { header: "Commodity code" },
  { header: "Product" },
  { header: "PO number" },
  { header: "Quantity", numFmt: "#,##0.###" },
  { header: "Quantity unit" },
  { header: "Invoice value (native)", numFmt: "#,##0.00" },
  { header: "Currency" },
  { header: "FX rate", numFmt: "0.000000" },
  { header: "FX source" },
  { header: "Invoice value (GBP)", numFmt: "#,##0.00" },
  { header: "Freight (native)", numFmt: "#,##0.00" },
  { header: "Freight (GBP)", numFmt: "#,##0.00" },
  { header: "Insurance (native)", numFmt: "#,##0.00" },
  { header: "Insurance (GBP)", numFmt: "#,##0.00" },
  { header: "Duty (native)", numFmt: "#,##0.00" },
  { header: "Duty (GBP)", numFmt: "#,##0.00" },
  { header: "Other (native)", numFmt: "#,##0.00" },
  { header: "Other (GBP)", numFmt: "#,##0.00" },
  { header: "Total landed (native)", numFmt: "#,##0.00" },
  { header: "Total landed (GBP)", numFmt: "#,##0.00" },
  { header: "Per unit landed (GBP)", numFmt: "#,##0.0000" },
  { header: "IOR" },
  { header: "Customs status" },
  { header: "Expected landed", numFmt: "yyyy-mm-dd" },
  { header: "Actual landed", numFmt: "yyyy-mm-dd" },
  { header: "Reason" },
  { header: "Created at", numFmt: "yyyy-mm-dd" },
  { header: "Updated at", numFmt: "yyyy-mm-dd" },
];

const AMBER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF4E5" },
};

function toExcelDate(iso: string | null): Date | null {
  if (!iso) return null;
  // Shipment date columns are stored as date-only strings (YYYY-MM-DD).
  // Parsing as UTC midnight keeps the cell on the intended calendar day
  // regardless of the server's TZ.
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sumNative(s: Shipment): number | null {
  if (s.invoice_value == null) return null;
  return (
    s.invoice_value +
    (s.freight_cost ?? 0) +
    (s.insurance_cost ?? 0) +
    (s.duty_cost ?? 0) +
    (s.other_costs ?? 0)
  );
}

function toGbp(native: number | null, fx: number | null): number | null {
  if (native == null || fx == null) return null;
  return native * fx;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: shipments, error } = await supabase
    .from("shipments")
    .select(
      "ref, status, shipment_category, origin_country, destination_country, supplier_name, haulier_name, incoterm, commodity_code, product_type, po_number, quantity, quantity_unit, invoice_value, currency, fx_rate_to_gbp, fx_rate_source, freight_cost, insurance_cost, duty_cost, other_costs, ior_name, customs_status, expected_landed_date, actual_landed_date, reason, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .returns<Shipment[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = shipments ?? [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Meridian";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Shipments", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    width: Math.max(12, c.header.length * 1.2),
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.border = {
    bottom: { style: "thin", color: { argb: "FF333333" } },
  };

  for (const s of rows) {
    const fx = s.fx_rate_to_gbp;
    const invoiceGbp = toGbp(s.invoice_value, fx);
    const freightGbp = toGbp(s.freight_cost, fx);
    const insuranceGbp = toGbp(s.insurance_cost, fx);
    const dutyGbp = toGbp(s.duty_cost, fx);
    const otherGbp = toGbp(s.other_costs, fx);
    const totalNative = sumNative(s);
    const totalGbp = toGbp(totalNative, fx);
    const perUnitGbp =
      totalGbp != null && s.quantity && s.quantity > 0
        ? totalGbp / s.quantity
        : null;

    const row = sheet.addRow([
      s.ref,
      STATUS_LABEL[s.status] ?? s.status,
      s.shipment_category ? SHIPMENT_CATEGORY_LABELS[s.shipment_category] : null,
      s.origin_country,
      s.destination_country,
      s.supplier_name,
      s.haulier_name,
      s.incoterm,
      s.commodity_code,
      s.product_type,
      s.po_number,
      s.quantity,
      s.quantity_unit,
      s.invoice_value,
      s.currency,
      fx,
      s.fx_rate_source ? FX_RATE_SOURCE_LABELS[s.fx_rate_source] : null,
      invoiceGbp,
      s.freight_cost,
      freightGbp,
      s.insurance_cost,
      insuranceGbp,
      s.duty_cost,
      dutyGbp,
      s.other_costs,
      otherGbp,
      totalNative,
      totalGbp,
      perUnitGbp,
      s.ior_name,
      s.customs_status ? CUSTOMS_LABEL[s.customs_status] : null,
      toExcelDate(s.expected_landed_date),
      toExcelDate(s.actual_landed_date),
      s.reason,
      toExcelDate(s.created_at),
      toExcelDate(s.updated_at),
    ]);

    // Amber only on the two cells where the data is absent — FX rate and
    // FX source. Derived GBP cells stay empty so finance can trace
    // "empty GBP + populated native" back to the amber FX column
    // without having to guess which cell is causal.
    if (fx == null) {
      const fxRateCell = row.getCell(16); // "FX rate"
      const fxSourceCell = row.getCell(17); // "FX source"
      fxRateCell.fill = AMBER_FILL;
      fxSourceCell.fill = AMBER_FILL;
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="meridian-shipments-${today}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
