"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ShipmentEventChange, ShipmentStatus } from "@/lib/types";

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

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  review: "Review",
  alert: "Flag",
  archived: "Archived",
};

const FIELD_LABELS: Record<keyof ShipmentInput, string> = {
  origin_country: "Origin",
  destination_country: "Destination",
  supplier_name: "Supplier",
  haulier_name: "Haulier",
  incoterm: "Incoterm",
  commodity_code: "Commodity code",
  product_type: "Product",
  invoice_value: "Invoice value",
  currency: "Currency",
  ior_name: "IOR",
  reason: "Reason",
};

function diffInput(
  before: ShipmentInput,
  after: ShipmentInput,
): Record<string, ShipmentEventChange> {
  const changes: Record<string, ShipmentEventChange> = {};
  (Object.keys(FIELD_LABELS) as (keyof ShipmentInput)[]).forEach((key) => {
    const a = before[key];
    const b = after[key];
    if (a !== b) changes[key] = { from: a, to: b };
  });
  return changes;
}

function summariseChanges(
  changes: Record<string, ShipmentEventChange>,
): string {
  const keys = Object.keys(changes);
  if (keys.length === 0) return "No changes";
  if (keys.length === 1) {
    return `Updated ${FIELD_LABELS[keys[0] as keyof ShipmentInput] ?? keys[0]}`;
  }
  if (keys.length <= 3) {
    return `Updated ${keys
      .map((k) => FIELD_LABELS[k as keyof ShipmentInput] ?? k)
      .join(", ")}`;
  }
  return `Updated ${keys.length} fields`;
}

export async function createShipment(
  input: ShipmentInput,
): Promise<ActionResult<{ id: string; ref: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

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

  await supabase.from("shipment_events").insert({
    shipment_id: data.id,
    type: "created",
    summary: `Created ${data.ref}`,
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data };
}

export async function updateShipment(
  id: string,
  input: ShipmentInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select(
      "origin_country, destination_country, supplier_name, haulier_name, incoterm, commodity_code, product_type, invoice_value, currency, ior_name, reason",
    )
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  let product_type = input.product_type;
  if (input.commodity_code && input.commodity_code !== current.commodity_code) {
    const { data: cc } = await supabase
      .from("commodity_codes")
      .select("product_type")
      .eq("code", input.commodity_code)
      .single();
    product_type = cc?.product_type ?? input.product_type ?? current.product_type;
  } else if (product_type === null) {
    product_type = current.product_type;
  }

  const nextInput: ShipmentInput = { ...input, product_type };
  const changes = diffInput(current as ShipmentInput, nextInput);

  if (Object.keys(changes).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update(nextInput)
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("shipment_events").insert({
    shipment_id: id,
    type: "updated",
    summary: summariseChanges(changes),
    changes,
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data: undefined };
}

export async function updateShipmentStatus(
  id: string,
  status: ShipmentStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select("status")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  if (current.status === status) {
    return { ok: true, data: undefined };
  }

  const { error } = await supabase
    .from("shipments")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const fromLabel = STATUS_LABELS[current.status] ?? current.status;
  const toLabel = STATUS_LABELS[status] ?? status;

  await supabase.from("shipment_events").insert({
    shipment_id: id,
    type: "status_changed",
    summary: `Status: ${fromLabel} → ${toLabel}`,
    changes: { status: { from: current.status, to: status } },
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data: undefined };
}
