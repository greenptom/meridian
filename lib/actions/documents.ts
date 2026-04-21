"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const { data: doc, error: updateError } = await supabase
    .from("shipment_documents")
    .update({ shipment_id: shipmentId })
    .eq("id", documentId)
    .select("filename, extraction_confidence")
    .single();

  if (updateError || !doc) {
    return { ok: false, error: updateError?.message ?? "Document not found" };
  }

  const confidencePct =
    typeof doc.extraction_confidence === "number"
      ? ` · ${Math.round(doc.extraction_confidence * 100)}% confidence`
      : "";
  const summary = `Attached ${doc.filename ?? "document"}${confidencePct}`;

  await supabase.from("shipment_events").insert({
    shipment_id: shipmentId,
    type: "document_attached",
    summary,
    created_by: user.id,
  });

  return { ok: true, data: undefined };
}

export async function getSignedDocumentUrl(
  documentId: string,
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: doc, error } = await supabase
    .from("shipment_documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();
  if (error || !doc) {
    return { ok: false, error: error?.message ?? "Document not found" };
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("shipment-docs")
    .createSignedUrl(doc.storage_path, 60 * 60);
  if (signError || !signed) {
    return {
      ok: false,
      error: signError?.message ?? "Failed to sign document URL",
    };
  }

  return { ok: true, data: { url: signed.signedUrl } };
}
