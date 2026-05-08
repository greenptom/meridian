import { createClient } from "@/lib/supabase/server";
import type { Haulier } from "@/lib/types";
import { HauliersView } from "@/components/refs/hauliers-view";

export const dynamic = "force-dynamic";

export default async function HauliersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hauliers")
    .select(
      "id, name, country, contact_email, contact_phone, notes, primary_purpose, applicable_products, typical_incoterms, deleted_at, created_at, updated_at",
    )
    .order("deleted_at", { ascending: true, nullsFirst: true })
    .order("name");

  const hauliers = (data ?? []) as Haulier[];
  return <HauliersView hauliers={hauliers} />;
}
