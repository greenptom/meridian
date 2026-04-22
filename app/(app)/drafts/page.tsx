import { createClient } from "@/lib/supabase/server";
import { ShipmentsView } from "@/components/shipments/shipments-view";
import type {
  Shipment,
  Incoterm,
  CommodityCode,
  ShipmentDocument,
  ShipmentEvent,
} from "@/lib/types";

export const dynamic = "force-dynamic";

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
      documents={(documents ?? []) as ShipmentDocument[]}
      events={(events ?? []) as ShipmentEvent[]}
      headerVariant="drafts"
    />
  );
}
