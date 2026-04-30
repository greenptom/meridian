import { createClient } from "@/lib/supabase/server";
import { ShipmentsView } from "@/components/shipments/shipments-view";
import {
  parseTimeWindowParams,
  resolveTimeWindow,
} from "@/lib/time-window";
import type {
  Shipment,
  Incoterm,
  CommodityCode,
  ShipmentDocument,
  ShipmentEvent,
  Haulier,
  Supplier,
  Ior,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage({
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
  const destination = flat.destination?.toUpperCase() ?? null;

  const supabase = await createClient();

  let shipmentsQuery = supabase
    .from("shipments")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (window.from) {
    shipmentsQuery = shipmentsQuery.gte(
      "created_at",
      window.from.toISOString(),
    );
  }
  if (window.to) {
    shipmentsQuery = shipmentsQuery.lt("created_at", window.to.toISOString());
  }
  // The 100-row cap is kept when no window is active. With an explicit
  // window the bound does the limiting — finance needs every row in
  // their selected period.
  if (!window.from && !window.to) {
    shipmentsQuery = shipmentsQuery.limit(100);
  }

  const [
    { data: shipments },
    { data: incoterms },
    { data: commodityCodes },
    { data: hauliers },
    { data: suppliers },
    { data: iors },
  ] = await Promise.all([
    shipmentsQuery,
    supabase.from("incoterms").select("*").order("code"),
    supabase.from("commodity_codes").select("*").order("product_type"),
    supabase
      .from("hauliers")
      .select("*")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("suppliers")
      .select("*")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("iors")
      .select("*")
      .is("deleted_at", null)
      .order("name"),
  ]);

  const rows = (shipments ?? []) as Shipment[];
  const ids = rows.map((r) => r.id);

  const [{ data: documents }, { data: events }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("shipment_documents")
            .select(
              "id, shipment_id, storage_path, filename, mime_type, file_size, extraction_confidence, extracted_at, created_at",
            )
            .in("shipment_id", ids)
            .order("created_at", { ascending: false }),
          supabase
            .from("shipment_events")
            .select("*")
            .in("shipment_id", ids)
            .order("created_at", { ascending: false }),
        ]);

  return (
    <ShipmentsView
      shipments={rows}
      incoterms={(incoterms ?? []) as Incoterm[]}
      commodityCodes={(commodityCodes ?? []) as CommodityCode[]}
      hauliers={(hauliers ?? []) as Haulier[]}
      suppliers={(suppliers ?? []) as Supplier[]}
      iors={(iors ?? []) as Ior[]}
      documents={(documents ?? []) as ShipmentDocument[]}
      events={(events ?? []) as ShipmentEvent[]}
      destinationFilter={destination}
      windowLabel={window.label}
    />
  );
}
