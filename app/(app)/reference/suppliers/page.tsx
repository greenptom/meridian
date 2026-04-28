import { createClient } from "@/lib/supabase/server";
import type { Supplier, Incoterm } from "@/lib/types";
import { SuppliersView } from "@/components/refs/suppliers-view";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = await createClient();

  const [{ data: suppliers }, { data: incoterms }] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, country, commodity_focus, default_incoterm, notes, deleted_at, created_at, updated_at",
      )
      .order("deleted_at", { ascending: true, nullsFirst: true })
      .order("name"),
    supabase.from("incoterms").select("*").order("code"),
  ]);

  return (
    <SuppliersView
      suppliers={(suppliers ?? []) as Supplier[]}
      incoterms={(incoterms ?? []) as Incoterm[]}
    />
  );
}
