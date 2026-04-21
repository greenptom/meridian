import { createClient } from "@/lib/supabase/server";
import { ShipmentsView } from "@/components/shipments/shipments-view";
import type {
  Shipment,
  Incoterm,
  CommodityCode,
  ShipmentDocument,
  ShipmentEvent,
  ShipmentBatchUseWithBatch,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function flattenUses(
  raw: unknown[] | null | undefined,
): ShipmentBatchUseWithBatch[] {
  const list = (raw ?? []) as Array<Record<string, unknown>>;
  return list.map((r) => {
    const b = r.batch;
    const batch = Array.isArray(b) ? (b[0] ?? null) : (b ?? null);
    return { ...r, batch } as ShipmentBatchUseWithBatch;
  });
}

export default async function DraftsPage() {
  const supabase = await createClient();

  const [{ data: shipments }, { data: incoterms }, { data: commodityCodes }] =
    await Promise.all([
      supabase
        .from("shipments")
        .select("*")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("incoterms").select("*").order("code"),
      supabase.from("commodity_codes").select("*").order("product_type"),
    ]);

  const rows = (shipments ?? []) as Shipment[];
  const ids = rows.map((r) => r.id);

  const [{ data: documents }, { data: events }, { data: batchUses }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
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
          supabase
            .from("shipment_batch_uses")
            .select(
              "id, shipment_id, batch_id, quantity_used, quantity_unit, notes, organisation_id, created_at, batch:batches(id, batch_code, blend_name, roasted_date, quantity_unit)",
            )
            .in("shipment_id", ids)
            .order("created_at", { ascending: false }),
        ]);

  return (
    <ShipmentsView
      shipments={rows}
      incoterms={(incoterms ?? []) as Incoterm[]}
      commodityCodes={(commodityCodes ?? []) as CommodityCode[]}
      documents={(documents ?? []) as ShipmentDocument[]}
      events={(events ?? []) as ShipmentEvent[]}
      batchUses={flattenUses(batchUses)}
      headerVariant="drafts"
    />
  );
}
