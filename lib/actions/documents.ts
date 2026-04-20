"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/shipments";

export async function linkDocumentToShipment(
  documentId: string,
  shipmentId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("shipment_documents")
    .update({ shipment_id: shipmentId })
    .eq("id", documentId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}
