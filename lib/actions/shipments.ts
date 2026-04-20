"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ShipmentInput = {
  origin_country: string | null;
  destination_country: string | null;
  supplier_name: string | null;
  haulier_name: string | null;
  incoterm: string | null;
  commodity_code: string | null;
  product_type: string | null;
  invoice_value: number | null;
  currency: string | null;
  ior_name: string | null;
  reason: string | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createShipment(
  input: ShipmentInput,
): Promise<ActionResult<{ id: string; ref: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Look up product_type from commodity code if not provided
  let product_type = input.product_type;
  if (!product_type && input.commodity_code) {
    const { data: cc } = await supabase
      .from("commodity_codes")
      .select("product_type")
      .eq("code", input.commodity_code)
      .single();
    product_type = cc?.product_type ?? null;
  }

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      ...input,
      product_type,
      created_by: user.id,
      status: "draft",
    })
    .select("id, ref")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create shipment" };
  revalidatePath("/shipments");
  return { ok: true, data };
}

export async function updateShipmentStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shipments")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/shipments");
  return { ok: true, data: undefined };
}
