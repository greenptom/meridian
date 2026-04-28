"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type HaulierInput = {
  name: string;
  country: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type EventChange = { from: unknown; to: unknown };

const FIELD_LABELS: Record<keyof HaulierInput, string> = {
  name: "Name",
  country: "Country",
  contact_email: "Contact email",
  contact_phone: "Contact phone",
  notes: "Notes",
};

function diffInput(
  before: HaulierInput,
  after: HaulierInput,
): Record<string, EventChange> {
  const changes: Record<string, EventChange> = {};
  (Object.keys(FIELD_LABELS) as (keyof HaulierInput)[]).forEach((key) => {
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
    return `Updated ${FIELD_LABELS[keys[0] as keyof HaulierInput] ?? keys[0]}`;
  }
  if (keys.length <= 3) {
    return `Updated ${keys
      .map((k) => FIELD_LABELS[k as keyof HaulierInput] ?? k)
      .join(", ")}`;
  }
  return `Updated ${keys.length} fields`;
}

function normaliseInput(input: HaulierInput): HaulierInput {
  return {
    name: input.name.trim(),
    country: input.country?.trim()?.toUpperCase() || null,
    contact_email: input.contact_email?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createHaulier(
  raw: HaulierInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);
  if (!input.name) return { ok: false, error: "Name is required." };

  const { data, error } = await supabase
    .from("hauliers")
    .insert(input)
    .select("id, name")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: error?.message ?? "Failed to create haulier" };
  }

  await supabase.from("haulier_events").insert({
    haulier_id: data.id,
    type: "created",
    summary: `Created ${input.name}`,
    created_by: user.id,
  });

  revalidatePath("/reference/hauliers");
  return { ok: true, data: { id: data.id } };
}

export async function updateHaulier(
  id: string,
  raw: HaulierInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);

  const { data: current, error: fetchError } = await supabase
    .from("hauliers")
    .select("name, country, contact_email, contact_phone, notes")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Haulier not found" };
  }

  const changes = diffInput(current as HaulierInput, input);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("hauliers")
    .update(input)
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, error: `${input.name} is already in the list.` };
    }
    return { ok: false, error: updateError.message };
  }

  await supabase.from("haulier_events").insert({
    haulier_id: id,
    type: "updated",
    summary: summariseChanges(changes),
    changes,
    created_by: user.id,
  });

  revalidatePath("/reference/hauliers");
  return { ok: true, data: undefined };
}

export async function archiveHaulier(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("hauliers")
    .select("name")
    .eq("id", id)
    .single();

  // Archive precondition: refuse if any shipments still reference this
  // haulier via the FK column. The FK uses on-delete restrict, but
  // archiving is a soft-delete that wouldn't trip the cascade — this
  // application-level guard is what actually protects audit history.
  const { count, error: countError } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("haulier_id", id);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot archive: ${count} shipment${count === 1 ? "" : "s"} reference ${current?.name ?? "this haulier"}. Update those shipments first.`,
    };
  }

  const { error } = await supabase
    .from("hauliers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("haulier_events").insert({
    haulier_id: id,
    type: "archived",
    summary: current ? `Archived ${current.name}` : "Archived",
    created_by: user.id,
  });

  revalidatePath("/reference/hauliers");
  return { ok: true, data: undefined };
}

export async function restoreHaulier(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("hauliers")
    .select("name")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("hauliers")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Can't restore — an active haulier with this name already exists. Archive that one first.",
      };
    }
    return { ok: false, error: error.message };
  }

  await supabase.from("haulier_events").insert({
    haulier_id: id,
    type: "restored",
    summary: current ? `Restored ${current.name}` : "Restored",
    created_by: user.id,
  });

  revalidatePath("/reference/hauliers");
  return { ok: true, data: undefined };
}
