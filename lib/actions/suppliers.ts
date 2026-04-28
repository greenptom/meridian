"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SupplierInput = {
  name: string;
  country: string | null;
  commodity_focus: string | null;
  default_incoterm: string | null;
  notes: string | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type EventChange = { from: unknown; to: unknown };

const FIELD_LABELS: Record<keyof SupplierInput, string> = {
  name: "Name",
  country: "Country",
  commodity_focus: "Commodity focus",
  default_incoterm: "Default incoterm",
  notes: "Notes",
};

function diffInput(
  before: SupplierInput,
  after: SupplierInput,
): Record<string, EventChange> {
  const changes: Record<string, EventChange> = {};
  (Object.keys(FIELD_LABELS) as (keyof SupplierInput)[]).forEach((key) => {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key], to: after[key] };
    }
  });
  return changes;
}

function summariseChanges(changes: Record<string, EventChange>): string {
  const keys = Object.keys(changes);
  if (keys.length === 0) return "No changes";
  if (keys.length === 1) {
    return `Updated ${FIELD_LABELS[keys[0] as keyof SupplierInput] ?? keys[0]}`;
  }
  if (keys.length <= 3) {
    return `Updated ${keys
      .map((k) => FIELD_LABELS[k as keyof SupplierInput] ?? k)
      .join(", ")}`;
  }
  return `Updated ${keys.length} fields`;
}

function normaliseInput(input: SupplierInput): SupplierInput {
  return {
    name: input.name.trim(),
    country: input.country?.trim()?.toUpperCase() || null,
    commodity_focus: input.commodity_focus?.trim() || null,
    default_incoterm: input.default_incoterm?.trim()?.toUpperCase() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createSupplier(
  raw: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);
  if (!input.name) return { ok: false, error: "Name is required." };

  const { data, error } = await supabase
    .from("suppliers")
    .insert(input)
    .select("id, name")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: error?.message ?? "Failed to create supplier" };
  }

  await supabase.from("supplier_events").insert({
    supplier_id: data.id,
    type: "created",
    summary: `Created ${input.name}`,
    created_by: user.id,
  });

  revalidatePath("/reference/suppliers");
  return { ok: true, data: { id: data.id } };
}

export async function updateSupplier(
  id: string,
  raw: SupplierInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);

  const { data: current, error: fetchError } = await supabase
    .from("suppliers")
    .select("name, country, commodity_focus, default_incoterm, notes")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Supplier not found" };
  }

  const changes = diffInput(current as SupplierInput, input);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("suppliers")
    .update(input)
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: updateError.message };
  }

  await supabase.from("supplier_events").insert({
    supplier_id: id,
    type: "updated",
    summary: summariseChanges(changes),
    changes,
    created_by: user.id,
  });

  revalidatePath("/reference/suppliers");
  return { ok: true, data: undefined };
}

export async function archiveSupplier(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", id)
    .single();

  const { count, error: countError } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot archive: ${count} shipment${count === 1 ? "" : "s"} reference ${current?.name ?? "this supplier"}. Update those shipments first.`,
    };
  }

  const { error } = await supabase
    .from("suppliers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("supplier_events").insert({
    supplier_id: id,
    type: "archived",
    summary: current ? `Archived ${current.name}` : "Archived",
    created_by: user.id,
  });

  revalidatePath("/reference/suppliers");
  return { ok: true, data: undefined };
}

export async function restoreSupplier(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("suppliers")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Can't restore — an active supplier with this name already exists. Archive that one first.",
      };
    }
    return { ok: false, error: error.message };
  }

  await supabase.from("supplier_events").insert({
    supplier_id: id,
    type: "restored",
    summary: current ? `Restored ${current.name}` : "Restored",
    created_by: user.id,
  });

  revalidatePath("/reference/suppliers");
  return { ok: true, data: undefined };
}
