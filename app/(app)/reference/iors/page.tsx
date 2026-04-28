import { createClient } from "@/lib/supabase/server";
import type { Ior } from "@/lib/types";
import { IorsView } from "@/components/refs/iors-view";

export const dynamic = "force-dynamic";

export default async function IorsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("iors")
    .select(
      "id, name, country, vat_country, eori_number, notes, scenario_type, deleted_at, created_at, updated_at",
    )
    .order("deleted_at", { ascending: true, nullsFirst: true })
    .order("name");

  const iors = (data ?? []) as Ior[];
  return <IorsView iors={iors} />;
}
