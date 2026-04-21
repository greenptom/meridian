"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  CustomsStatus,
  QuantityUnit,
  ShipmentEventChange,
  ShipmentStatus,
} from "@/lib/types";

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
  po_number: string | null;
  quantity: number | null;
  quantity_unit: QuantityUnit | null;
  expected_landed_date: string | null;
  actual_landed_date: string | null;
  customs_status: CustomsStatus | null;
  freight_cost: number | null;
  insurance_cost: number | null;
  duty_cost: number | null;
  other_costs: number | null;
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
  po_number: "PO number",
  quantity: "Quantity",
  quantity_unit: "Quantity unit",
  expected_landed_date: "Expected landed",
  actual_landed_date: "Actual landed",
  customs_status: "Customs status",
  freight_cost: "Freight",
  insurance_cost: "Insurance",
  duty_cost: "Duty",
  other_costs: "Other costs",
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

function friendlyDbError(error: {
  code?: string;
  message?: string;
}): string {
  if (
    error?.code === "23514" &&
    typeof error.message === "string" &&
    error.message.includes("shipments_landed_requires_quantity")
  ) {
    return "Quantity must be set before a shipment can be marked as landed.";
  }
  return error?.message ?? "Unknown error";
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
  nextStatus: ShipmentStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select(
      "status, origin_country, destination_country, supplier_name, haulier_name, incoterm, commodity_code, product_type, invoice_value, currency, ior_name, reason, po_number, quantity, quantity_unit, expected_landed_date, actual_landed_date, customs_status, freight_cost, insurance_cost, duty_cost, other_costs",
    )
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  const currentInput: ShipmentInput = {
    origin_country: current.origin_country,
    destination_country: current.destination_country,
    supplier_name: current.supplier_name,
    haulier_name: current.haulier_name,
    incoterm: current.incoterm,
    commodity_code: current.commodity_code,
    product_type: current.product_type,
    invoice_value: current.invoice_value,
    currency: current.currency,
    ior_name: current.ior_name,
    reason: current.reason,
    po_number: current.po_number,
    quantity: current.quantity,
    quantity_unit: current.quantity_unit,
    expected_landed_date: current.expected_landed_date,
    actual_landed_date: current.actual_landed_date,
    customs_status: current.customs_status,
    freight_cost: current.freight_cost,
    insurance_cost: current.insurance_cost,
    duty_cost: current.duty_cost,
    other_costs: current.other_costs,
  };

  const changes = diffInput(currentInput, input);
  const statusChanged = current.status !== nextStatus;

  if (Object.keys(changes).length === 0 && !statusChanged) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update({ ...input, status: nextStatus })
    .eq("id", id);
  if (updateError) return { ok: false, error: friendlyDbError(updateError) };

  type EventInsert = {
    shipment_id: string;
    type:
      | "status_changed"
      | "updated"
      | "customs_cleared"
      | "customs_held";
    summary: string;
    changes: Record<string, ShipmentEventChange>;
    created_by: string;
  };
  const eventsToInsert: EventInsert[] = [];

  if (statusChanged) {
    const fromLabel = STATUS_LABELS[current.status] ?? current.status;
    const toLabel = STATUS_LABELS[nextStatus] ?? nextStatus;
    eventsToInsert.push({
      shipment_id: id,
      type: "status_changed",
      summary: `Status: ${fromLabel} → ${toLabel}`,
      changes: { status: { from: current.status, to: nextStatus } },
      created_by: user.id,
    });
  }

  if (Object.keys(changes).length > 0) {
    eventsToInsert.push({
      shipment_id: id,
      type: "updated",
      summary: summariseChanges(changes),
      changes,
      created_by: user.id,
    });
  }

  const customsBefore = current.customs_status;
  const customsAfter = input.customs_status;
  if (customsBefore !== customsAfter) {
    if (customsAfter === "cleared") {
      eventsToInsert.push({
        shipment_id: id,
        type: "customs_cleared",
        summary: "Customs cleared",
        changes: {
          customs_status: { from: customsBefore, to: customsAfter },
        },
        created_by: user.id,
      });
    } else if (customsAfter === "held") {
      eventsToInsert.push({
        shipment_id: id,
        type: "customs_held",
        summary: "Customs held",
        changes: {
          customs_status: { from: customsBefore, to: customsAfter },
        },
        created_by: user.id,
      });
    }
  }

  if (eventsToInsert.length > 0) {
    await supabase.from("shipment_events").insert(eventsToInsert);
  }

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data: undefined };
}

export type LandingInput = {
  actual_landed_date: string;
  freight_cost: number | null;
  insurance_cost: number | null;
  duty_cost: number | null;
  other_costs: number | null;
};

export async function markShipmentLanded(
  id: string,
  input: LandingInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select(
      "status, invoice_value, freight_cost, insurance_cost, duty_cost, other_costs, currency",
    )
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  const nextStatus: ShipmentStatus =
    current.status === "active" ? "review" : current.status;
  const statusFlipped = nextStatus !== current.status;

  const landingUpdate = {
    actual_landed_date: input.actual_landed_date,
    freight_cost: input.freight_cost,
    insurance_cost: input.insurance_cost,
    duty_cost: input.duty_cost,
    other_costs: input.other_costs,
    status: nextStatus,
  };

  const { error: updateError } = await supabase
    .from("shipments")
    .update(landingUpdate)
    .eq("id", id);
  if (updateError) return { ok: false, error: friendlyDbError(updateError) };

  const totalLanded =
    current.invoice_value != null
      ? current.invoice_value +
        (input.freight_cost ?? 0) +
        (input.insurance_cost ?? 0) +
        (input.duty_cost ?? 0) +
        (input.other_costs ?? 0)
      : null;

  type LandingEventInsert = {
    shipment_id: string;
    type: "landed" | "status_changed";
    summary: string;
    changes: Record<string, ShipmentEventChange>;
    created_by: string;
  };

  const eventsToInsert: LandingEventInsert[] = [
    {
      shipment_id: id,
      type: "landed",
      summary: totalLanded != null
        ? `Landed ${input.actual_landed_date} · total ${formatCostSummary(totalLanded, current.currency)}`
        : `Landed ${input.actual_landed_date}`,
      changes: {
        actual_landed_date: {
          from: null,
          to: input.actual_landed_date,
        },
        freight_cost: { from: current.freight_cost, to: input.freight_cost },
        insurance_cost: {
          from: current.insurance_cost,
          to: input.insurance_cost,
        },
        duty_cost: { from: current.duty_cost, to: input.duty_cost },
        other_costs: { from: current.other_costs, to: input.other_costs },
        total_landed_cost: { from: null, to: totalLanded },
      },
      created_by: user.id,
    },
  ];

  if (statusFlipped) {
    const fromLabel = STATUS_LABELS[current.status] ?? current.status;
    const toLabel = STATUS_LABELS[nextStatus] ?? nextStatus;
    eventsToInsert.push({
      shipment_id: id,
      type: "status_changed",
      summary: `Status: ${fromLabel} → ${toLabel}`,
      changes: { status: { from: current.status, to: nextStatus } },
      created_by: user.id,
    });
  }

  await supabase.from("shipment_events").insert(eventsToInsert);

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data: undefined };
}

function formatCostSummary(value: number, currency: string | null): string {
  const code = currency ?? "GBP";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}
