"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type IorInput = {
  name: string;
  country: string | null;
  vat_country: string | null;
  eori_number: string | null;
  notes: string | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type EventChange = { from: unknown; to: unknown };

const FIELD_LABELS: Record<keyof IorInput, string> = {
  name: "Name",
  country: "Country",
  vat_country: "VAT country",
  eori_number: "EORI number",
  notes: "Notes",
};

function diffInput(
  before: IorInput,
  after: IorInput,
): Record<string, EventChange> {
  const changes: Record<string, EventChange> = {};
  (Object.keys(FIELD_LABELS) as (keyof IorInput)[]).forEach((key) => {
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
    return `Updated ${FIELD_LABELS[keys[0] as keyof IorInput] ?? keys[0]}`;
  }
  if (keys.length <= 3) {
    return `Updated ${keys
      .map((k) => FIELD_LABELS[k as keyof IorInput] ?? k)
      .join(", ")}`;
  }
  return `Updated ${keys.length} fields`;
}

function normaliseInput(input: IorInput): IorInput {
  return {
    name: input.name.trim(),
    country: input.country?.trim()?.toUpperCase() || null,
    vat_country: input.vat_country?.trim()?.toUpperCase() || null,
    eori_number: input.eori_number?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createIor(
  raw: IorInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);
  if (!input.name) return { ok: false, error: "Name is required." };

  const { data, error } = await supabase
    .from("iors")
    .insert(input)
    .select("id, name")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: error?.message ?? "Failed to create IOR" };
  }

  await supabase.from("ior_events").insert({
    ior_id: data.id,
    type: "created",
    summary: `Created ${input.name}`,
    created_by: user.id,
  });

  revalidatePath("/reference/iors");
  return { ok: true, data: { id: data.id } };
}

export async function updateIor(
  id: string,
  raw: IorInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);

  const { data: current, error: fetchError } = await supabase
    .from("iors")
    .select("name, country, vat_country, eori_number, notes")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "IOR not found" };
  }

  const changes = diffInput(current as IorInput, input);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("iors")
    .update(input)
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: updateError.message };
  }

  await supabase.from("ior_events").insert({
    ior_id: id,
    type: "updated",
    summary: summariseChanges(changes),
    changes,
    created_by: user.id,
  });

  revalidatePath("/reference/iors");
  return { ok: true, data: undefined };
}

export async function archiveIor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("iors")
    .select("name")
    .eq("id", id)
    .single();

  const { count, error: countError } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("ior_id", id);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot archive: ${count} shipment${count === 1 ? "" : "s"} reference ${current?.name ?? "this IOR"}. Update those shipments first.`,
    };
  }

  const { error } = await supabase
    .from("iors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("ior_events").insert({
    ior_id: id,
    type: "archived",
    summary: current ? `Archived ${current.name}` : "Archived",
    created_by: user.id,
  });

  revalidatePath("/reference/iors");
  return { ok: true, data: undefined };
}

export async function restoreIor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("iors")
    .select("name")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("iors")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Can't restore — an active IOR with this name already exists. Archive that one first.",
      };
    }
    return { ok: false, error: error.message };
  }

  await supabase.from("ior_events").insert({
    ior_id: id,
    type: "restored",
    summary: current ? `Restored ${current.name}` : "Restored",
    created_by: user.id,
  });

  revalidatePath("/reference/iors");
  return { ok: true, data: undefined };
}
