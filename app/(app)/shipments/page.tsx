import { createClient } from "@/lib/supabase/server";
import { KpiStrip } from "@/components/shipments/kpi-strip";
import { ShipmentsTable } from "@/components/shipments/shipments-table";
import { ShipmentsPageHeader } from "@/components/shipments/page-header";
import type { Shipment, Incoterm, CommodityCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const supabase = await createClient();

  const [{ data: shipments }, { data: incoterms }, { data: commodityCodes }] = await Promise.all([
    supabase
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("incoterms").select("*").order("code"),
    supabase.from("commodity_codes").select("*").order("product_type"),
  ]);

  const rows = (shipments ?? []) as Shipment[];
  const activeCount = rows.filter((r) => r.status === "active").length;
  const flaggedCount = rows.filter(
    (r) => r.status === "alert" || (r.flags?.length ?? 0) > 0
  ).length;

  return (
    <>
      <ShipmentsPageHeader
        activeCount={activeCount}
        flaggedCount={flaggedCount}
        incoterms={(incoterms ?? []) as Incoterm[]}
        commodityCodes={(commodityCodes ?? []) as CommodityCode[]}
      />
      <KpiStrip shipments={rows} />
      <ShipmentsTable shipments={rows} />
    </>
  );
}
