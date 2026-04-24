import { createClient } from "@/lib/supabase/server";
import type { Jurisdiction } from "@/lib/types";
import { JurisdictionsView } from "@/components/jurisdictions/jurisdictions-view";

export const dynamic = "force-dynamic";

export default async function VatPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vat_registrations")
    .select(
      "id, country_code, country_name, vat_number, status, registered_date, notes, registration_type, managed_by_avask, filing_period, deleted_at, created_at, updated_at",
    )
    .order("deleted_at", { ascending: true, nullsFirst: true })
    .order("country_code");

  const jurisdictions = (data ?? []) as Jurisdiction[];

  return <JurisdictionsView jurisdictions={jurisdictions} />;
}
