"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  lookupFxRate,
  todayUtcIsoDate,
  type FxLookup,
} from "@/lib/fx/frankfurter";
import type {
  CustomsStatus,
  FxRateSource,
  QuantityUnit,
  ShipmentCategory,
  ShipmentEventChange,
  ShipmentStatus,
} from "@/lib/types";

export type ShipmentInput = {
  origin_country: string | null;
  destination_country: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  haulier_id: string | null;
  haulier_name: string | null;
  incoterm: string | null;
  commodity_code: string | null;
  product_type: string | null;
  shipment_category: ShipmentCategory | null;
  invoice_value: number | null;
  currency: string | null;
  fx_rate_to_gbp: number | null;
  fx_rate_source: FxRateSource | null;
  ior_id: string | null;
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
  closed: "Closed",
  archived: "Archived",
};

// Reference _id columns are intentionally absent — diffs and audit
// summaries track _name only (decision: _id is plumbing, _name is the
// human-readable column).
const FIELD_LABELS: Partial<Record<keyof ShipmentInput, string>> = {
  origin_country: "Origin",
  destination_country: "Destination",
  supplier_name: "Supplier",
  haulier_name: "Haulier",
  incoterm: "Incoterm",
  commodity_code: "Commodity code",
  product_type: "Product",
  shipment_category: "Category",
  invoice_value: "Invoice value",
  currency: "Currency",
  fx_rate_to_gbp: "FX rate",
  fx_rate_source: "FX source",
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

// Reference dual-write: when the client sends a non-null _id we treat
// the reference table as the source of truth for the denormalised
// _name column. The _name from the form is ignored in that case so a
// stale label (e.g. an old extraction value held in the form) can't
// drift away from the canonical row. When _id is null the _name is
// preserved as-is, including the legacy free-text path.
async function resolveRefNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: ShipmentInput,
): Promise<ShipmentInput> {
  async function fetchName(
    table: "hauliers" | "suppliers" | "iors",
    id: string | null,
  ): Promise<string | null> {
    if (!id) return null;
    const { data } = await supabase
      .from(table)
      .select("name")
      .eq("id", id)
      .single();
    return data?.name ?? null;
  }
  const [haulierName, supplierName, iorName] = await Promise.all([
    fetchName("hauliers", input.haulier_id),
    fetchName("suppliers", input.supplier_id),
    fetchName("iors", input.ior_id),
  ]);
  return {
    ...input,
    haulier_name: input.haulier_id ? haulierName : input.haulier_name,
    supplier_name: input.supplier_id ? supplierName : input.supplier_name,
    ior_name: input.ior_id ? iorName : input.ior_name,
  };
}

type ResolvedFx = {
  fx_rate_to_gbp: number | null;
  fx_rate_source: FxRateSource | null;
};

// Turns a raw FxLookup into the two persisted columns.
function fxColumnsFromLookup(lookup: FxLookup): ResolvedFx {
  if (lookup.ok) {
    return { fx_rate_to_gbp: lookup.rate, fx_rate_source: lookup.source };
  }
  return { fx_rate_to_gbp: null, fx_rate_source: "needs_review" };
}

// Resolves the FX columns for a save, given the client's input and
// (optional) current-record values. The client signals a manual override
// by sending fx_rate_source === 'manual'; anything else triggers a
// Frankfurter fetch for `fxDate`.
async function resolveFx(
  input: { currency: string | null; fx_rate_to_gbp: number | null; fx_rate_source: FxRateSource | null },
  fxDate: string,
): Promise<ResolvedFx> {
  if (input.fx_rate_source === "manual") {
    return {
      fx_rate_to_gbp: input.fx_rate_to_gbp,
      fx_rate_source: input.fx_rate_to_gbp != null ? "manual" : "needs_review",
    };
  }
  const lookup = await lookupFxRate(input.currency, fxDate);
  return fxColumnsFromLookup(lookup);
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

  const fx = await resolveFx(input, todayUtcIsoDate());
  const resolved = await resolveRefNames(supabase, input);

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      ...resolved,
      product_type,
      fx_rate_to_gbp: fx.fx_rate_to_gbp,
      fx_rate_source: fx.fx_rate_source,
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

  // Closed and archived are reached only through the dedicated
  // close/archive actions so the precondition checks run. Reject
  // direct edits with a friendly nudge.
  if (nextStatus === "closed") {
    return {
      ok: false,
      error: "Use the Mark as closed button to close a shipment.",
    };
  }
  if (nextStatus === "archived") {
    return {
      ok: false,
      error: "Use the Archive button to file shipments.",
    };
  }

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select(
      "status, origin_country, destination_country, supplier_id, supplier_name, haulier_id, haulier_name, incoterm, commodity_code, product_type, shipment_category, invoice_value, currency, fx_rate_to_gbp, fx_rate_source, ior_id, ior_name, reason, po_number, quantity, quantity_unit, expected_landed_date, actual_landed_date, customs_status, freight_cost, insurance_cost, duty_cost, other_costs",
    )
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  const currentInput: ShipmentInput = {
    origin_country: current.origin_country,
    destination_country: current.destination_country,
    supplier_id: current.supplier_id,
    supplier_name: current.supplier_name,
    haulier_id: current.haulier_id,
    haulier_name: current.haulier_name,
    incoterm: current.incoterm,
    commodity_code: current.commodity_code,
    product_type: current.product_type,
    shipment_category: current.shipment_category,
    invoice_value: current.invoice_value,
    currency: current.currency,
    fx_rate_to_gbp: current.fx_rate_to_gbp,
    fx_rate_source: current.fx_rate_source,
    ior_id: current.ior_id,
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

  // Resolve canonical ref names before diff/persist so the audit log
  // and the denormalised _name columns reflect the source of truth in
  // the reference tables, not whatever label the form happened to send.
  const resolvedInput = await resolveRefNames(supabase, input);

  // FX resolution rules on edit:
  //   - client sent fx_rate_source === 'manual'  → trust the typed rate
  //   - currency changed                         → re-fetch for today
  //   - otherwise                                → keep current FX columns
  const currencyChanged = currentInput.currency !== resolvedInput.currency;
  let effectiveInput: ShipmentInput = resolvedInput;
  if (resolvedInput.fx_rate_source === "manual") {
    const fx = await resolveFx(resolvedInput, todayUtcIsoDate());
    effectiveInput = { ...resolvedInput, ...fx };
  } else if (currencyChanged) {
    const fx = await resolveFx(
      { ...resolvedInput, fx_rate_source: null },
      todayUtcIsoDate(),
    );
    effectiveInput = { ...resolvedInput, ...fx };
  } else {
    effectiveInput = {
      ...resolvedInput,
      fx_rate_to_gbp: currentInput.fx_rate_to_gbp,
      fx_rate_source: currentInput.fx_rate_source,
    };
  }

  const changes = diffInput(currentInput, effectiveInput);
  const statusChanged = current.status !== nextStatus;

  if (Object.keys(changes).length === 0 && !statusChanged) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update({ ...effectiveInput, status: nextStatus })
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
  const customsAfter = resolvedInput.customs_status;
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

// ===========================================================================
// Archive workflow — two-step lifecycle.
//
// closeShipment    : active|review → status='closed' (stays in /shipments)
// archiveShipment  : closed         → archived_at=now() (moves to /archive)
// restoreShipment  : archived_at IS NOT NULL → archived_at=null
//
// Each writes a precise event so the audit trail shows the lifecycle
// distinctly from generic status_changed updates. Restore lazily
// migrates legacy status='archived' rows to 'closed' on the way back
// out of the archive — one less special case to worry about over time.
// ===========================================================================

export async function closeShipment(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select("status, archived_at")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  if (current.status !== "active" && current.status !== "review") {
    return {
      ok: false,
      error: `Only active or review shipments can be closed. This one is ${STATUS_LABELS[current.status] ?? current.status}.`,
    };
  }

  const { error: updateError } = await supabase
    .from("shipments")
    .update({ status: "closed" })
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };

  const fromLabel = STATUS_LABELS[current.status] ?? current.status;
  await supabase.from("shipment_events").insert({
    shipment_id: id,
    type: "status_changed",
    summary: `Status: ${fromLabel} → Closed`,
    changes: { status: { from: current.status, to: "closed" } },
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  return { ok: true, data: undefined };
}

export async function archiveShipment(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select("status, archived_at, ref")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }

  if (current.archived_at) {
    return { ok: false, error: "Already archived." };
  }
  if (current.status !== "closed") {
    return {
      ok: false,
      error: "Only closed shipments can be archived. Mark it as closed first.",
    };
  }

  const archivedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("shipments")
    .update({ archived_at: archivedAt })
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("shipment_events").insert({
    shipment_id: id,
    type: "archived",
    summary: `Archived ${current.ref}`,
    changes: { archived_at: { from: null, to: archivedAt } },
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  revalidatePath("/archive");
  return { ok: true, data: undefined };
}

export async function restoreShipment(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select("status, archived_at, ref")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Shipment not found" };
  }
  if (!current.archived_at) {
    return { ok: false, error: "This shipment isn't archived." };
  }

  // Lazy migration: legacy rows had their status set to 'archived' in
  // pre-phase-5 days. Restoring one normalises it to 'closed' so it
  // can re-enter the archive through the standard path. Recorded in
  // the event payload so the migration stays visible in audit history.
  const isLegacy = current.status === "archived";
  const update: { archived_at: null; status?: ShipmentStatus } = {
    archived_at: null,
  };
  if (isLegacy) update.status = "closed";

  const { error: updateError } = await supabase
    .from("shipments")
    .update(update)
    .eq("id", id);
  if (updateError) return { ok: false, error: updateError.message };

  const changes: Record<string, ShipmentEventChange> = {
    archived_at: { from: current.archived_at, to: null },
  };
  if (isLegacy) {
    changes.status = { from: "archived", to: "closed" };
  }
  await supabase.from("shipment_events").insert({
    shipment_id: id,
    type: "restored",
    summary: `Restored ${current.ref}`,
    changes,
    created_by: user.id,
  });

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  revalidatePath("/archive");
  return { ok: true, data: undefined };
}
