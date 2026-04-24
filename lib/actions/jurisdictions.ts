"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canonicalCountry } from "@/lib/countries";
import type { JurisdictionStatus } from "@/lib/types";

export type JurisdictionInput = {
  country_code: string;
  country_name: string;
  vat_number: string | null;
  status: JurisdictionStatus;
  registered_date: string | null;
  notes: string | null;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type EventChange = { from: unknown; to: unknown };

const FIELD_LABELS: Record<keyof JurisdictionInput, string> = {
  country_code: "Country code",
  country_name: "Country name",
  vat_number: "VAT number",
  status: "Status",
  registered_date: "Registered date",
  notes: "Notes",
};

function diffInput(
  before: JurisdictionInput,
  after: JurisdictionInput,
): Record<string, EventChange> {
  const changes: Record<string, EventChange> = {};
  (Object.keys(FIELD_LABELS) as (keyof JurisdictionInput)[]).forEach((key) => {
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
    return `Updated ${FIELD_LABELS[keys[0] as keyof JurisdictionInput] ?? keys[0]}`;
  }
  if (keys.length <= 3) {
    return `Updated ${keys
      .map((k) => FIELD_LABELS[k as keyof JurisdictionInput] ?? k)
      .join(", ")}`;
  }
  return `Updated ${keys.length} fields`;
}

function normaliseInput(input: JurisdictionInput): JurisdictionInput {
  const canonical = canonicalCountry(input.country_code);
  return {
    ...input,
    country_code: canonical ?? input.country_code.trim().toUpperCase(),
    country_name: input.country_name.trim(),
    vat_number: input.vat_number?.trim() || null,
    registered_date: input.registered_date || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createJurisdiction(
  raw: JurisdictionInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);
  if (!input.country_code || !input.country_name) {
    return { ok: false, error: "Country code and name are required." };
  }

  const { data, error } = await supabase
    .from("vat_registrations")
    .insert({
      country_code: input.country_code,
      country_name: input.country_name,
      vat_number: input.vat_number,
      status: input.status,
      registered_date: input.registered_date,
      notes: input.notes,
    })
    .select("id, country_code")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: `${input.country_code} is already registered.`,
      };
    }
    return {
      ok: false,
      error: error?.message ?? "Failed to create jurisdiction",
    };
  }

  await supabase.from("jurisdiction_events").insert({
    jurisdiction_id: data.id,
    type: "created",
    summary: `Created ${input.country_code} · ${input.country_name}`,
    created_by: user.id,
  });

  revalidatePath("/reference/vat");
  revalidatePath("/exposure");
  return { ok: true, data: { id: data.id } };
}

export async function updateJurisdiction(
  id: string,
  raw: JurisdictionInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const input = normaliseInput(raw);

  const { data: current, error: fetchError } = await supabase
    .from("vat_registrations")
    .select(
      "country_code, country_name, vat_number, status, registered_date, notes",
    )
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return {
      ok: false,
      error: fetchError?.message ?? "Jurisdiction not found",
    };
  }

  const currentInput: JurisdictionInput = {
    country_code: current.country_code,
    country_name: current.country_name,
    vat_number: current.vat_number,
    status: current.status as JurisdictionStatus,
    registered_date: current.registered_date,
    notes: current.notes,
  };

  const changes = diffInput(currentInput, input);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: undefined };
  }

  const { error: updateError } = await supabase
    .from("vat_registrations")
    .update({
      country_code: input.country_code,
      country_name: input.country_name,
      vat_number: input.vat_number,
      status: input.status,
      registered_date: input.registered_date,
      notes: input.notes,
    })
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23505") {
      return {
        ok: false,
        error: `${input.country_code} is already registered.`,
      };
    }
    return { ok: false, error: updateError.message };
  }

  await supabase.from("jurisdiction_events").insert({
    jurisdiction_id: id,
    type: "updated",
    summary: summariseChanges(changes),
    changes,
    created_by: user.id,
  });

  revalidatePath("/reference/vat");
  revalidatePath("/exposure");
  return { ok: true, data: undefined };
}

export async function archiveJurisdiction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("vat_registrations")
    .select("country_code, country_name")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("vat_registrations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("jurisdiction_events").insert({
    jurisdiction_id: id,
    type: "archived",
    summary: current
      ? `Archived ${current.country_code} · ${current.country_name}`
      : "Archived",
    created_by: user.id,
  });

  revalidatePath("/reference/vat");
  revalidatePath("/exposure");
  return { ok: true, data: undefined };
}

export async function restoreJurisdiction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: current } = await supabase
    .from("vat_registrations")
    .select("country_code, country_name")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("vat_registrations")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Can't restore — an active jurisdiction already exists for this country. Archive the other one first.",
      };
    }
    return { ok: false, error: error.message };
  }

  await supabase.from("jurisdiction_events").insert({
    jurisdiction_id: id,
    type: "restored",
    summary: current
      ? `Restored ${current.country_code} · ${current.country_name}`
      : "Restored",
    created_by: user.id,
  });

  revalidatePath("/reference/vat");
  revalidatePath("/exposure");
  return { ok: true, data: undefined };
}
