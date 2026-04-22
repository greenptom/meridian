"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  Batch,
  QuantityUnit,
  ShipmentBatchUse,
} from "@/lib/types";
import type { ActionResult } from "@/lib/actions/shipments";

export type BatchInput = {
  batch_code: string;
  blend_name: string | null;
  roasted_date: string | null;
  quantity_produced: number;
  quantity_unit: QuantityUnit;
  notes: string | null;
};

export type BatchUseInput = {
  shipment_id: string;
  quantity_used: number;
  notes: string | null;
};

export async function createBatch(
  batch: BatchInput,
  uses: BatchUseInput[],
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  if (!batch.batch_code.trim()) {
    return { ok: false, error: "Batch code is required." };
  }
  if (!(batch.quantity_produced > 0)) {
    return { ok: false, error: "Quantity produced must be greater than 0." };
  }
  if (uses.length === 0) {
    return { ok: false, error: "Add at least one source shipment." };
  }

  const usedSum = uses.reduce((a, u) => a + u.quantity_used, 0);
  if (Math.abs(usedSum - batch.quantity_produced) > 0.0005) {
    return {
      ok: false,
      error: `Source quantities sum to ${usedSum}; batch total is ${batch.quantity_produced}.`,
    };
  }

  const sourceIds = uses.map((u) => u.shipment_id);
  const { data: sourceShipments, error: srcError } = await supabase
    .from("shipments")
    .select("id, ref, quantity, quantity_unit")
    .in("id", sourceIds);
  if (srcError) return { ok: false, error: srcError.message };
  const sourceById = new Map(
    (sourceShipments ?? []).map((s) => [s.id, s]),
  );
  for (const u of uses) {
    const src = sourceById.get(u.shipment_id);
    if (!src) {
      return {
        ok: false,
        error: `Source shipment ${u.shipment_id} not found.`,
      };
    }
    if (src.quantity_unit == null) {
      return {
        ok: false,
        error: `Shipment ${src.ref} has no quantity unit; set it before using it in a batch.`,
      };
    }
    if (src.quantity_unit !== batch.quantity_unit) {
      return {
        ok: false,
        error: `Shipment ${src.ref} is in ${src.quantity_unit}, batch is in ${batch.quantity_unit}. Units must match.`,
      };
    }
    if (!(u.quantity_used > 0)) {
      return {
        ok: false,
        error: `Quantity used on ${src.ref} must be greater than 0.`,
      };
    }
  }

  const { data: remainingRows } = await supabase
    .from("shipment_batch_uses")
    .select("shipment_id, quantity_used")
    .in("shipment_id", sourceIds);
  const usedByShipment = new Map<string, number>();
  for (const r of remainingRows ?? []) {
    usedByShipment.set(
      r.shipment_id,
      (usedByShipment.get(r.shipment_id) ?? 0) + Number(r.quantity_used),
    );
  }
  for (const u of uses) {
    const src = sourceById.get(u.shipment_id)!;
    const already = usedByShipment.get(u.shipment_id) ?? 0;
    const remaining = (src.quantity ?? 0) - already;
    if (u.quantity_used > remaining + 0.0005) {
      return {
        ok: false,
        error: `Shipment ${src.ref} only has ${remaining} ${src.quantity_unit} remaining; tried to use ${u.quantity_used}.`,
      };
    }
  }

  const { data: insertedBatch, error: batchError } = await supabase
    .from("batches")
    .insert({
      batch_code: batch.batch_code.trim(),
      blend_name: batch.blend_name,
      roasted_date: batch.roasted_date,
      quantity_produced: batch.quantity_produced,
      quantity_unit: batch.quantity_unit,
      notes: batch.notes,
      created_by: user.id,
    })
    .select("id, batch_code")
    .single();
  if (batchError || !insertedBatch) {
    return {
      ok: false,
      error: batchError?.message ?? "Failed to create batch",
    };
  }

  const useRows = uses.map((u) => ({
    shipment_id: u.shipment_id,
    batch_id: insertedBatch.id,
    quantity_used: u.quantity_used,
    quantity_unit: batch.quantity_unit,
    notes: u.notes,
  }));
  const { error: usesError } = await supabase
    .from("shipment_batch_uses")
    .insert(useRows);
  if (usesError) {
    await supabase.from("batches").delete().eq("id", insertedBatch.id);
    return { ok: false, error: usesError.message };
  }

  const batchEvent = {
    shipment_id: null,
    batch_id: insertedBatch.id,
    type: "batch_created" as const,
    summary: `Created ${insertedBatch.batch_code}${batch.blend_name ? ` · ${batch.blend_name}` : ""} (${batch.quantity_produced} ${batch.quantity_unit})`,
    payload: {
      batch_code: insertedBatch.batch_code,
      blend_name: batch.blend_name,
      quantity_produced: batch.quantity_produced,
      quantity_unit: batch.quantity_unit,
      source_count: uses.length,
    },
    created_by: user.id,
  };
  const useEvents = uses.map((u) => {
    const src = sourceById.get(u.shipment_id)!;
    return {
      shipment_id: u.shipment_id,
      batch_id: insertedBatch.id,
      type: "batch_used" as const,
      summary: `Used ${u.quantity_used} ${batch.quantity_unit} in ${insertedBatch.batch_code}`,
      payload: {
        batch_id: insertedBatch.id,
        batch_code: insertedBatch.batch_code,
        shipment_ref: src.ref,
        quantity_used: u.quantity_used,
        quantity_unit: batch.quantity_unit,
      },
      created_by: user.id,
    };
  });
  await supabase
    .from("shipment_events")
    .insert([batchEvent, ...useEvents]);

  revalidatePath("/shipments");
  revalidatePath("/drafts");
  revalidatePath("/batches");
  return { ok: true, data: { id: insertedBatch.id } };
}

// TODO: the blended-cost and remaining-quantity computations below run
// client-side after this fetch. For v1 the data volumes are small and it
// keeps the /batches list / /batches/[id] detail / shipment-detail
// "batches produced" section all in one code path. Once we want to
// filter or sort batches by blended cost at the DB level, promote
// batch_blended_cost into a proper SQL view (or materialised view with
// refresh-on-insert trigger) so the list query can sort/filter on it
// directly — and drop this client-side compute.

export type BatchWithSummary = Batch & {
  source_count: number;
  total_source_quantity: number;
  blended_cost: number | null;
};

export async function listBatchesWithSummary(): Promise<BatchWithSummary[]> {
  const supabase = await createClient();
  const { data: batches } = await supabase
    .from("batches")
    .select("*")
    .order("roasted_date", { ascending: false, nullsFirst: false });
  const batchRows = (batches ?? []) as Batch[];
  if (batchRows.length === 0) return [];

  const batchIds = batchRows.map((b) => b.id);
  const { data: uses } = await supabase
    .from("shipment_batch_uses")
    .select("*")
    .in("batch_id", batchIds);
  const useRows = (uses ?? []) as ShipmentBatchUse[];

  const shipmentIds = Array.from(new Set(useRows.map((u) => u.shipment_id)));
  const { data: shipments } =
    shipmentIds.length === 0
      ? { data: [] }
      : await supabase
          .from("shipments")
          .select(
            "id, ref, quantity, quantity_unit, invoice_value, freight_cost, insurance_cost, duty_cost, other_costs",
          )
          .in("id", shipmentIds);
  const shipmentById = new Map(
    (shipments ?? []).map((s) => [s.id, s]),
  );

  return batchRows.map((b) => {
    const bu = useRows.filter((u) => u.batch_id === b.id);
    return {
      ...b,
      source_count: bu.length,
      total_source_quantity: bu.reduce(
        (a, u) => a + Number(u.quantity_used),
        0,
      ),
      blended_cost: computeBlendedCost(bu, shipmentById),
    };
  });
}

type SourceShipment = {
  id: string;
  ref: string;
  quantity: number | null;
  quantity_unit: string | null;
  invoice_value: number | null;
  freight_cost: number | null;
  insurance_cost: number | null;
  duty_cost: number | null;
  other_costs: number | null;
};

function computeBlendedCost(
  uses: ShipmentBatchUse[],
  shipmentById: Map<string, SourceShipment>,
): number | null {
  let totalCost = 0;
  let totalQty = 0;
  for (const u of uses) {
    const s = shipmentById.get(u.shipment_id);
    if (!s) return null;
    if (
      s.invoice_value == null ||
      s.freight_cost == null ||
      s.insurance_cost == null ||
      s.duty_cost == null ||
      s.other_costs == null ||
      s.quantity == null ||
      s.quantity === 0
    ) {
      return null;
    }
    const shipmentTotal =
      s.invoice_value +
      s.freight_cost +
      s.insurance_cost +
      s.duty_cost +
      s.other_costs;
    const perUnit = shipmentTotal / s.quantity;
    totalCost += Number(u.quantity_used) * perUnit;
    totalQty += Number(u.quantity_used);
  }
  if (totalQty === 0) return null;
  return totalCost / totalQty;
}

export type EligibleSource = {
  id: string;
  ref: string;
  origin_country: string | null;
  destination_country: string | null;
  quantity: number;
  quantity_unit: QuantityUnit;
  remaining: number;
};

export async function listEligibleSources(): Promise<EligibleSource[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("shipments")
    .select(
      "id, ref, origin_country, destination_country, quantity, quantity_unit, status",
    )
    .not("quantity", "is", null)
    .not("quantity_unit", "is", null)
    .in("status", ["active", "review"]);

  const shipments = (rows ?? []) as {
    id: string;
    ref: string;
    origin_country: string | null;
    destination_country: string | null;
    quantity: number;
    quantity_unit: QuantityUnit;
    status: string;
  }[];
  if (shipments.length === 0) return [];

  const ids = shipments.map((s) => s.id);
  const { data: uses } = await supabase
    .from("shipment_batch_uses")
    .select("shipment_id, quantity_used")
    .in("shipment_id", ids);
  const usedById = new Map<string, number>();
  for (const u of uses ?? []) {
    usedById.set(
      u.shipment_id,
      (usedById.get(u.shipment_id) ?? 0) + Number(u.quantity_used),
    );
  }

  return shipments
    .map((s) => ({
      id: s.id,
      ref: s.ref,
      origin_country: s.origin_country,
      destination_country: s.destination_country,
      quantity: Number(s.quantity),
      quantity_unit: s.quantity_unit,
      remaining: Number(s.quantity) - (usedById.get(s.id) ?? 0),
    }))
    .filter((s) => s.remaining > 0)
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

export type BatchSource = {
  use_id: string;
  shipment_id: string;
  ref: string;
  origin_country: string | null;
  destination_country: string | null;
  quantity_used: number;
  quantity_unit: QuantityUnit;
  per_unit_landed: number | null;
  total_contribution: number | null;
  missing_cost_fields: string[];
};

export type BatchDetailData = {
  batch: Batch;
  sources: BatchSource[];
  blended_cost: number | null;
};

const COST_FIELDS = [
  "invoice_value",
  "freight_cost",
  "insurance_cost",
  "duty_cost",
  "other_costs",
] as const;
const COST_FIELD_LABELS: Record<(typeof COST_FIELDS)[number], string> = {
  invoice_value: "invoice value",
  freight_cost: "freight",
  insurance_cost: "insurance",
  duty_cost: "duty",
  other_costs: "other costs",
};

export async function getBatchBySlug(
  batchCode: string,
): Promise<BatchDetailData | null> {
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("batch_code", batchCode)
    .single();
  if (!batch) return null;

  const { data: useRows } = await supabase
    .from("shipment_batch_uses")
    .select("id, shipment_id, quantity_used, quantity_unit")
    .eq("batch_id", batch.id);
  const uses = (useRows ?? []) as {
    id: string;
    shipment_id: string;
    quantity_used: number;
    quantity_unit: QuantityUnit;
  }[];

  const sourceIds = Array.from(new Set(uses.map((u) => u.shipment_id)));
  const { data: shipRows } =
    sourceIds.length === 0
      ? { data: [] }
      : await supabase
          .from("shipments")
          .select(
            "id, ref, origin_country, destination_country, quantity, invoice_value, freight_cost, insurance_cost, duty_cost, other_costs",
          )
          .in("id", sourceIds);
  const shipById = new Map(
    (shipRows ?? []).map((s) => [s.id as string, s]),
  );

  const sources: BatchSource[] = uses.map((u) => {
    const s = shipById.get(u.shipment_id);
    const ref = s?.ref ?? u.shipment_id;
    const missing: string[] = [];
    for (const f of COST_FIELDS) {
      if (!s || s[f] == null) missing.push(COST_FIELD_LABELS[f]);
    }
    if (!s || s.quantity == null || Number(s.quantity) === 0) {
      missing.push("quantity");
    }
    const total =
      missing.length === 0 && s
        ? Number(s.invoice_value) +
          Number(s.freight_cost) +
          Number(s.insurance_cost) +
          Number(s.duty_cost) +
          Number(s.other_costs)
        : null;
    const perUnit =
      total != null && s && s.quantity != null && Number(s.quantity) !== 0
        ? total / Number(s.quantity)
        : null;
    const contribution =
      perUnit != null ? perUnit * Number(u.quantity_used) : null;
    return {
      use_id: u.id,
      shipment_id: u.shipment_id,
      ref,
      origin_country: s?.origin_country ?? null,
      destination_country: s?.destination_country ?? null,
      quantity_used: Number(u.quantity_used),
      quantity_unit: u.quantity_unit,
      per_unit_landed: perUnit,
      total_contribution: contribution,
      missing_cost_fields: missing,
    };
  });

  const anyMissing = sources.some((s) => s.missing_cost_fields.length > 0);
  let blended: number | null = null;
  if (!anyMissing && sources.length > 0) {
    let totalCost = 0;
    let totalQty = 0;
    for (const s of sources) {
      if (s.total_contribution == null) {
        blended = null;
        break;
      }
      totalCost += s.total_contribution;
      totalQty += s.quantity_used;
    }
    blended = totalQty > 0 ? totalCost / totalQty : null;
  }

  return {
    batch: batch as Batch,
    sources: sources.sort((a, b) => a.ref.localeCompare(b.ref)),
    blended_cost: blended,
  };
}

export async function getRemainingByShipment(
  shipmentIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (shipmentIds.length === 0) return result;
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_batch_uses")
    .select("shipment_id, quantity_used")
    .in("shipment_id", shipmentIds);
  const used = new Map<string, number>();
  for (const r of data ?? []) {
    used.set(
      r.shipment_id,
      (used.get(r.shipment_id) ?? 0) + Number(r.quantity_used),
    );
  }
  const { data: shipRows } = await supabase
    .from("shipments")
    .select("id, quantity")
    .in("id", shipmentIds);
  for (const s of shipRows ?? []) {
    if (s.quantity == null) continue;
    result.set(s.id, Number(s.quantity) - (used.get(s.id) ?? 0));
  }
  return result;
}
