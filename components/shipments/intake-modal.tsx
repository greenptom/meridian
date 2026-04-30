"use client";

import { useState, useTransition, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createShipment,
  updateShipment,
  type ShipmentInput,
} from "@/lib/actions/shipments";
import { linkDocumentToShipment } from "@/lib/actions/documents";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type {
  Incoterm,
  CommodityCode,
  Shipment,
  ShipmentStatus,
  QuantityUnit,
  CustomsStatus,
  ShipmentCategory,
  FxRateSource,
  Haulier,
  Supplier,
  Ior,
} from "@/lib/types";
import {
  SHIPMENT_CATEGORIES,
  SHIPMENT_CATEGORY_LABELS,
  FX_RATE_SOURCE_LABELS,
} from "@/lib/types";
import { RefCombobox, type RefOption } from "@/components/ui/ref-combobox";
import { HaulierModal } from "@/components/refs/haulier-modal";
import { SupplierModal } from "@/components/refs/supplier-modal";
import { IorModal } from "@/components/refs/ior-modal";

type RefKind = "haulier" | "supplier" | "ior";

// closed and archived are reached only via the dedicated buttons in
// the detail panel — disabled here so the dropdown still renders the
// current value when editing a closed/archived shipment, but the user
// can't transition into either state through this control.
const STATUS_OPTIONS: {
  value: ShipmentStatus;
  label: string;
  disabled?: boolean;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "review", label: "Review" },
  { value: "alert", label: "Flag" },
  { value: "closed", label: "Closed", disabled: true },
  { value: "archived", label: "Archived", disabled: true },
];

const QUANTITY_UNITS: QuantityUnit[] = [
  "kg",
  "g",
  "lb",
  "units",
  "pallets",
  "containers",
];

const CUSTOMS_STATUS_OPTIONS: { value: CustomsStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "cleared", label: "Cleared" },
  { value: "held", label: "Held" },
];

function normaliseQuantityUnit(raw: string): QuantityUnit | "" {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  const map: Record<string, QuantityUnit> = {
    kg: "kg",
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    g: "g",
    gram: "g",
    grams: "g",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    unit: "units",
    units: "units",
    pc: "units",
    pcs: "units",
    piece: "units",
    pieces: "units",
    pallet: "pallets",
    pallets: "pallets",
    skid: "pallets",
    skids: "pallets",
    container: "containers",
    containers: "containers",
    teu: "containers",
    feu: "containers",
  };
  return map[s] ?? "";
}
import type {
  ExtractedShipment,
  ExtractedFieldName,
} from "@/lib/extraction/schema";

type FormState = {
  origin_country: string;
  destination_country: string;
  supplier_id: string | null;
  supplier_name: string;
  haulier_id: string | null;
  haulier_name: string;
  incoterm: string;
  commodity_code: string;
  product_type: string;
  shipment_category: ShipmentCategory | "";
  invoice_value: string;
  currency: string;
  fx_rate_to_gbp: string;
  fx_rate_source: FxRateSource | "";
  ior_id: string | null;
  ior_name: string;
  reason: string;
  status: ShipmentStatus;
  po_number: string;
  quantity: string;
  quantity_unit: QuantityUnit | "";
  expected_landed_date: string;
  actual_landed_date: string;
  customs_status: CustomsStatus | "";
  freight_cost: string;
  insurance_cost: string;
  duty_cost: string;
  other_costs: string;
};

const INITIAL_FORM: FormState = {
  origin_country: "",
  destination_country: "",
  supplier_id: null,
  supplier_name: "",
  haulier_id: null,
  haulier_name: "",
  incoterm: "",
  commodity_code: "",
  product_type: "",
  shipment_category: "",
  invoice_value: "",
  currency: "GBP",
  fx_rate_to_gbp: "",
  fx_rate_source: "",
  ior_id: null,
  ior_name: "",
  reason: "",
  status: "draft",
  po_number: "",
  quantity: "",
  quantity_unit: "",
  expected_landed_date: "",
  actual_landed_date: "",
  customs_status: "",
  freight_cost: "",
  insurance_cost: "",
  duty_cost: "",
  other_costs: "",
};

function formFromShipment(s: Shipment | null | undefined): FormState {
  if (!s) return INITIAL_FORM;
  return {
    origin_country: s.origin_country ?? "",
    destination_country: s.destination_country ?? "",
    supplier_id: s.supplier_id ?? null,
    supplier_name: s.supplier_name ?? "",
    haulier_id: s.haulier_id ?? null,
    haulier_name: s.haulier_name ?? "",
    incoterm: s.incoterm ?? "",
    commodity_code: s.commodity_code ?? "",
    product_type: s.product_type ?? "",
    shipment_category: s.shipment_category ?? "",
    invoice_value: s.invoice_value != null ? String(s.invoice_value) : "",
    currency: s.currency ?? "GBP",
    fx_rate_to_gbp:
      s.fx_rate_to_gbp != null ? String(s.fx_rate_to_gbp) : "",
    fx_rate_source: s.fx_rate_source ?? "",
    ior_id: s.ior_id ?? null,
    ior_name: s.ior_name ?? "",
    reason: s.reason ?? "",
    status: s.status,
    po_number: s.po_number ?? "",
    quantity: s.quantity != null ? String(s.quantity) : "",
    quantity_unit: s.quantity_unit ?? "",
    expected_landed_date: s.expected_landed_date ?? "",
    actual_landed_date: s.actual_landed_date ?? "",
    customs_status: s.customs_status ?? "",
    freight_cost: s.freight_cost != null ? String(s.freight_cost) : "",
    insurance_cost:
      s.insurance_cost != null ? String(s.insurance_cost) : "",
    duty_cost: s.duty_cost != null ? String(s.duty_cost) : "",
    other_costs: s.other_costs != null ? String(s.other_costs) : "",
  };
}

function toShipmentInput(form: FormState): ShipmentInput {
  const num = (v: string) => (v ? parseFloat(v) : null);
  return {
    origin_country: form.origin_country || null,
    destination_country: form.destination_country || null,
    supplier_id: form.supplier_id,
    supplier_name: form.supplier_name || null,
    haulier_id: form.haulier_id,
    haulier_name: form.haulier_name || null,
    incoterm: form.incoterm || null,
    commodity_code: form.commodity_code || null,
    product_type: form.product_type || null,
    shipment_category: form.shipment_category || null,
    invoice_value: num(form.invoice_value),
    currency: form.currency || "GBP",
    fx_rate_to_gbp: num(form.fx_rate_to_gbp),
    fx_rate_source: form.fx_rate_source || null,
    ior_id: form.ior_id,
    ior_name: form.ior_name || null,
    reason: form.reason || null,
    po_number: form.po_number || null,
    quantity: num(form.quantity),
    quantity_unit: form.quantity_unit || null,
    expected_landed_date: form.expected_landed_date || null,
    actual_landed_date: form.actual_landed_date || null,
    customs_status: form.customs_status || null,
    freight_cost: num(form.freight_cost),
    insurance_cost: num(form.insurance_cost),
    duty_cost: num(form.duty_cost),
    other_costs: num(form.other_costs),
  };
}

const ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/gif";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; filename: string }
  | { phase: "extracting"; filename: string }
  | { phase: "done"; filename: string }
  | { phase: "error"; message: string };

export function IntakeModal({
  open,
  onClose,
  incoterms,
  commodityCodes,
  hauliers: initialHauliers,
  suppliers: initialSuppliers,
  iors: initialIors,
  editingShipment = null,
  focusField = null,
}: {
  open: boolean;
  onClose: () => void;
  incoterms: Incoterm[];
  commodityCodes: CommodityCode[];
  hauliers: Haulier[];
  suppliers: Supplier[];
  iors: Ior[];
  editingShipment?: Shipment | null;
  focusField?: string | null;
}) {
  const isEditing = !!editingShipment;
  const router = useRouter();
  const [tab, setTab] = useState<0 | 1 | 2>(isEditing ? 2 : 0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    formFromShipment(editingShipment),
  );
  const [autoFilled, setAutoFilled] = useState<
    Partial<Record<ExtractedFieldName, number>>
  >({});
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [documentId, setDocumentId] = useState<string | null>(null);

  // Reference options held as local state so the inner "Add new" modal
  // can append the freshly created row without round-tripping through a
  // router.refresh (which would blank the intake mid-flow).
  const [hauliers, setHauliers] = useState<RefOption[]>(() =>
    initialHauliers.map((h) => ({ id: h.id, name: h.name, secondary: h.country })),
  );
  const [suppliers, setSuppliers] = useState<RefOption[]>(() =>
    initialSuppliers.map((s) => ({
      id: s.id,
      name: s.name,
      secondary: s.country,
    })),
  );
  const [iors, setIors] = useState<RefOption[]>(() =>
    initialIors.map((i) => ({ id: i.id, name: i.name, secondary: i.country })),
  );

  const [addNew, setAddNew] = useState<{
    kind: RefKind;
    initialName: string;
  } | null>(null);

  function setRefValue(
    kind: RefKind,
    v: { id: string | null; label: string },
  ) {
    setForm((f) => {
      if (kind === "haulier") return { ...f, haulier_id: v.id, haulier_name: v.label };
      if (kind === "supplier") return { ...f, supplier_id: v.id, supplier_name: v.label };
      return { ...f, ior_id: v.id, ior_name: v.label };
    });
    const nameKey = `${kind}_name` as ExtractedFieldName;
    setAutoFilled((a) => {
      if (!(nameKey in a)) return a;
      const next = { ...a };
      delete next[nameKey];
      return next;
    });
  }

  function appendRefOption(kind: RefKind, opt: RefOption) {
    if (kind === "haulier") setHauliers((l) => [...l, opt]);
    else if (kind === "supplier") setSuppliers((l) => [...l, opt]);
    else setIors((l) => [...l, opt]);
  }

  function refState(kind: RefKind): { id: string | null; label: string } {
    if (kind === "haulier")
      return { id: form.haulier_id, label: form.haulier_name };
    if (kind === "supplier")
      return { id: form.supplier_id, label: form.supplier_name };
    return { id: form.ior_id, label: form.ior_name };
  }

  const refOptions: Record<RefKind, RefOption[]> = useMemo(
    () => ({ haulier: hauliers, supplier: suppliers, ior: iors }),
    [hauliers, suppliers, iors],
  );

  function refNeedsWarning(kind: RefKind): boolean {
    const { id, label } = refState(kind);
    if (id) return false;
    const trimmed = label.trim();
    if (!trimmed) return false;
    return !refOptions[kind].some(
      (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
    );
  }

  useEffect(() => {
    if (!open || !focusField) return;
    // Defer the DOM query one tick so FxRow has had a chance to
    // commit its initiallyEditable-driven input render.
    const handle = setTimeout(() => {
      const el = document.getElementById(`intake-field-${focusField}`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus({ preventScroll: true });
      }
    }, 0);
    return () => clearTimeout(handle);
  }, [open, focusField]);

  function resetAll() {
    setForm(formFromShipment(editingShipment));
    setAutoFilled({});
    setUpload({ phase: "idle" });
    setDocumentId(null);
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Changing the currency invalidates the FX rate — clear it so the
      // server re-fetches on save. (GBP short-circuits in resolveFx.)
      if (key === "currency" && value !== f.currency) {
        next.fx_rate_to_gbp = "";
        next.fx_rate_source = "";
      }
      // Typing into the FX rate field is the single trigger that flips
      // source to 'manual'. Focus alone does not. This keeps a
      // needs_review flag intact until the user actually changes the
      // value.
      if (key === "fx_rate_to_gbp" && value !== f.fx_rate_to_gbp) {
        next.fx_rate_source = "manual";
      }
      return next;
    });
    if (key in autoFilled) {
      setAutoFilled((a) => {
        const next = { ...a };
        delete next[key as ExtractedFieldName];
        return next;
      });
    }
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) {
      setUpload({
        phase: "error",
        message: `Unsupported file type: ${file.type || "unknown"}`,
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUpload({ phase: "error", message: "File is larger than 10 MB" });
      return;
    }

    setUpload({ phase: "uploading", filename: file.name });
    const supabase = createBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUpload({ phase: "error", message: "Not signed in" });
      return;
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("shipment-docs")
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) {
      setUpload({
        phase: "error",
        message: `Upload failed: ${uploadError.message}`,
      });
      return;
    }

    setUpload({ phase: "extracting", filename: file.name });
    let payload: {
      documentId: string;
      extracted: ExtractedShipment;
      overallConfidence: number;
    };
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          filename: file.name,
          mimeType: file.type,
        }),
      });
      if (!res.ok) {
        const { error: apiError } = await res.json().catch(() => ({}));
        throw new Error(apiError ?? `Extraction failed (${res.status})`);
      }
      payload = await res.json();
    } catch (err) {
      setUpload({
        phase: "error",
        message: err instanceof Error ? err.message : "Extraction failed",
      });
      return;
    }

    const e = payload.extracted;
    const filled: Partial<Record<ExtractedFieldName, number>> = {};
    const nextForm: FormState = { ...INITIAL_FORM };
    type StringFormField = Exclude<
      keyof FormState,
      | "status"
      | "quantity_unit"
      | "customs_status"
      | "shipment_category"
      | "fx_rate_source"
    >;
    function take<K extends ExtractedFieldName>(
      key: K,
      formKey: StringFormField,
      stringify: (v: NonNullable<ExtractedShipment[K]["value"]>) => string,
    ) {
      const entry = e[key];
      if (entry.value !== null && entry.value !== undefined) {
        nextForm[formKey] = stringify(
          entry.value as NonNullable<ExtractedShipment[K]["value"]>,
        );
        filled[key] = entry.confidence;
      }
    }
    take("origin_country", "origin_country", (v) => String(v));
    take("destination_country", "destination_country", (v) => String(v));
    take("supplier_name", "supplier_name", (v) => String(v));
    take("haulier_name", "haulier_name", (v) => String(v));
    take("incoterm", "incoterm", (v) => String(v).toUpperCase());
    take("commodity_code", "commodity_code", (v) => String(v));
    take("invoice_value", "invoice_value", (v) => String(v));
    take("currency", "currency", (v) => String(v).toUpperCase());
    take("reason", "reason", (v) => String(v));
    take("po_number", "po_number", (v) => String(v));
    take("quantity", "quantity", (v) => String(v));

    const unitEntry = e.quantity_unit;
    if (unitEntry.value !== null && unitEntry.value !== undefined) {
      const normalised = normaliseQuantityUnit(String(unitEntry.value));
      if (normalised) {
        nextForm.quantity_unit = normalised;
        filled.quantity_unit = unitEntry.confidence;
      }
    }

    const catEntry = e.shipment_category;
    if (catEntry.value !== null && catEntry.value !== undefined) {
      const raw = String(catEntry.value).toLowerCase().trim();
      if ((SHIPMENT_CATEGORIES as string[]).includes(raw)) {
        nextForm.shipment_category = raw as ShipmentCategory;
        filled.shipment_category = catEntry.confidence;
      }
    }

    if (!nextForm.currency) nextForm.currency = "GBP";

    // Try to resolve extracted ref names to FK rows by exact
    // case-insensitive match. A hit links the FK and replaces the
    // _name with the canonical spelling; a miss leaves _id null and
    // surfaces the "Not in reference list" affordance under the
    // combobox so the user can add or accept as free text.
    function resolveExtracted(
      typed: string,
      options: RefOption[],
    ): { id: string | null; label: string } {
      const q = typed.trim().toLowerCase();
      if (!q) return { id: null, label: typed };
      const match = options.find((o) => o.name.toLowerCase() === q);
      return match
        ? { id: match.id, label: match.name }
        : { id: null, label: typed };
    }
    if (nextForm.haulier_name) {
      const r = resolveExtracted(nextForm.haulier_name, hauliers);
      nextForm.haulier_id = r.id;
      nextForm.haulier_name = r.label;
    }
    if (nextForm.supplier_name) {
      const r = resolveExtracted(nextForm.supplier_name, suppliers);
      nextForm.supplier_id = r.id;
      nextForm.supplier_name = r.label;
    }
    // Extraction doesn't return ior_name, but reapply for symmetry in
    // case the form already had one carried in.
    if (nextForm.ior_name) {
      const r = resolveExtracted(nextForm.ior_name, iors);
      nextForm.ior_id = r.id;
      nextForm.ior_name = r.label;
    }

    setForm(nextForm);
    setAutoFilled(filled);
    setDocumentId(payload.documentId);
    setUpload({ phase: "done", filename: file.name });
  }, [hauliers, suppliers, iors]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toShipmentInput(form);
    if (!editingShipment && !input.shipment_category) {
      setError("Category is required for new shipments.");
      const catEl = document.getElementById("intake-field-shipment_category");
      if (catEl instanceof HTMLElement) {
        catEl.scrollIntoView({ behavior: "smooth", block: "center" });
        catEl.focus({ preventScroll: true });
      }
      return;
    }
    if (input.actual_landed_date && input.quantity == null) {
      setError(
        "Quantity is required before a shipment can be marked as landed.",
      );
      const qtyEl = document.getElementById("intake-field-quantity");
      if (qtyEl instanceof HTMLElement) {
        qtyEl.scrollIntoView({ behavior: "smooth", block: "center" });
        qtyEl.focus({ preventScroll: true });
      }
      return;
    }
    startTransition(async () => {
      if (editingShipment) {
        const result = await updateShipment(
          editingShipment.id,
          input,
          form.status,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createShipment(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (documentId) {
          await linkDocumentToShipment(documentId, result.data.id);
        }
      }
      resetAll();
      router.refresh();
      onClose();
    });
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  if (!open) return null;

  const showForm =
    isEditing || tab === 2 || (tab === 0 && upload.phase === "done");

  return (
    <>
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "rgba(20,15,5,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[680px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-7 pt-5 pb-4 flex justify-between items-start border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <div className="font-serif text-[26px] font-normal tracking-tight">
              {isEditing ? (
                <>
                  Edit <em className="text-[color:var(--color-ink-soft)]">movement</em>
                </>
              ) : (
                <>
                  Log a <em className="text-[color:var(--color-ink-soft)]">movement</em>
                </>
              )}
            </div>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              {isEditing
                ? `${editingShipment.ref}`
                : "Three ways to get data in"}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[20px] text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto flex-1 px-7 py-6">
          {!isEditing && (
            <div
              className="flex gap-1 p-1 rounded-lg border mb-5"
              style={{
                background: "var(--color-paper-warm)",
                borderColor: "var(--color-line)",
              }}
            >
              <TabButton active={tab === 0} onClick={() => setTab(0)}>
                Upload document
              </TabButton>
              <TabButton active={tab === 1} onClick={() => setTab(1)} disabled>
                Forward email
                <span className="font-mono text-[9px] ml-1.5 opacity-60">PHASE 3</span>
              </TabButton>
              <TabButton active={tab === 2} onClick={() => setTab(2)}>
                Manual entry
              </TabButton>
            </div>
          )}

          {!isEditing && tab === 0 && upload.phase !== "done" && (
            <Dropzone
              upload={upload}
              onFile={handleFile}
              onReset={() => setUpload({ phase: "idle" })}
            />
          )}

          {showForm && (
            <form id="intake-form" onSubmit={handleSubmit}>
              {!isEditing && tab === 0 && upload.phase === "done" && (
                <div
                  className="mb-5 flex items-center gap-3 p-3 rounded-md border"
                  style={{
                    background: "var(--color-ok-soft)",
                    borderColor: "var(--color-ok)",
                    color: "var(--color-ok)",
                  }}
                >
                  <span className="font-mono text-[11px] uppercase tracking-widest">
                    Extracted
                  </span>
                  <span className="text-[13px] flex-1 truncate">
                    {upload.filename}
                  </span>
                  <button
                    type="button"
                    className="font-mono text-[11px] underline"
                    onClick={() => {
                      resetAll();
                      setTab(0);
                    }}
                  >
                    Replace
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 gap-y-3.5">
                {isEditing && (
                  <FormField label="Status" className="col-span-2">
                    <select
                      className="form-input"
                      value={form.status}
                      onChange={(e) =>
                        update("status", e.target.value as ShipmentStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          disabled={o.disabled}
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
                <FormField
                  label="Origin country"
                  confidence={autoFilled.origin_country}
                >
                  <input
                    className={inputClass(autoFilled.origin_country)}
                    placeholder="e.g. Brazil"
                    value={form.origin_country}
                    onChange={(e) => update("origin_country", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Destination country"
                  confidence={autoFilled.destination_country}
                >
                  <input
                    className={inputClass(autoFilled.destination_country)}
                    placeholder="e.g. United Kingdom"
                    value={form.destination_country}
                    onChange={(e) =>
                      update("destination_country", e.target.value)
                    }
                  />
                </FormField>
                <FormField
                  label="Supplier"
                  confidence={autoFilled.supplier_name}
                >
                  <RefCombobox
                    value={refState("supplier")}
                    options={suppliers}
                    onChange={(v) => setRefValue("supplier", v)}
                    onAddNew={(name) =>
                      setAddNew({ kind: "supplier", initialName: name })
                    }
                    placeholder="Search suppliers"
                    inputClassName={inputClass(autoFilled.supplier_name)}
                    noun="supplier"
                  />
                  {refNeedsWarning("supplier") && (
                    <RefWarning
                      kind="supplier"
                      onAdd={() =>
                        setAddNew({
                          kind: "supplier",
                          initialName: form.supplier_name,
                        })
                      }
                    />
                  )}
                </FormField>
                <FormField
                  label="Haulier"
                  confidence={autoFilled.haulier_name}
                >
                  <RefCombobox
                    value={refState("haulier")}
                    options={hauliers}
                    onChange={(v) => setRefValue("haulier", v)}
                    onAddNew={(name) =>
                      setAddNew({ kind: "haulier", initialName: name })
                    }
                    placeholder="Search hauliers"
                    inputClassName={inputClass(autoFilled.haulier_name)}
                    noun="haulier"
                  />
                  {refNeedsWarning("haulier") && (
                    <RefWarning
                      kind="haulier"
                      onAdd={() =>
                        setAddNew({
                          kind: "haulier",
                          initialName: form.haulier_name,
                        })
                      }
                    />
                  )}
                </FormField>
                <FormField
                  label="Incoterm"
                  confidence={autoFilled.incoterm}
                >
                  <select
                    className={inputClass(autoFilled.incoterm)}
                    value={form.incoterm}
                    onChange={(e) => update("incoterm", e.target.value)}
                  >
                    <option value="">— select —</option>
                    {incoterms.map((i) => (
                      <option key={i.code} value={i.code}>
                        {i.code} · {i.full_name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Commodity code"
                  confidence={autoFilled.commodity_code}
                >
                  <input
                    type="text"
                    list="commodity-codes-list"
                    className={inputClass(autoFilled.commodity_code)}
                    placeholder="e.g. 0901 21 00 00"
                    value={form.commodity_code}
                    onChange={(e) => update("commodity_code", e.target.value)}
                  />
                  <datalist id="commodity-codes-list">
                    {commodityCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.product_type} · {c.code}
                      </option>
                    ))}
                  </datalist>
                </FormField>
                <FormField
                  label={`Category${isEditing ? "" : " *"}`}
                  confidence={autoFilled.shipment_category}
                >
                  <select
                    id="intake-field-shipment_category"
                    className={inputClass(autoFilled.shipment_category)}
                    value={form.shipment_category}
                    onChange={(e) =>
                      update(
                        "shipment_category",
                        e.target.value as ShipmentCategory | "",
                      )
                    }
                  >
                    <option value="">— select —</option>
                    {SHIPMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {SHIPMENT_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Invoice value"
                  confidence={autoFilled.invoice_value}
                >
                  <input
                    className={inputClass(autoFilled.invoice_value)}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.invoice_value}
                    onChange={(e) => update("invoice_value", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Currency"
                  confidence={autoFilled.currency}
                >
                  <select
                    className={inputClass(autoFilled.currency)}
                    value={form.currency}
                    onChange={(e) => update("currency", e.target.value)}
                  >
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </FormField>
                {form.currency !== "GBP" && (
                  <FxRow
                    rate={form.fx_rate_to_gbp}
                    source={form.fx_rate_source}
                    onChange={(v) => update("fx_rate_to_gbp", v)}
                    initiallyEditable={focusField === "fx_rate_to_gbp"}
                  />
                )}
                <FormField label="Importer of Record">
                  <RefCombobox
                    value={refState("ior")}
                    options={iors}
                    onChange={(v) => setRefValue("ior", v)}
                    onAddNew={(name) =>
                      setAddNew({ kind: "ior", initialName: name })
                    }
                    placeholder="Search IORs"
                    noun="IOR"
                  />
                  {refNeedsWarning("ior") && (
                    <RefWarning
                      kind="ior"
                      onAdd={() =>
                        setAddNew({
                          kind: "ior",
                          initialName: form.ior_name,
                        })
                      }
                    />
                  )}
                </FormField>
                {isEditing ? (
                  <FormField label="Product">
                    <input
                      type="text"
                      list="product-types-list"
                      className="form-input"
                      placeholder="e.g. Coffee (green)"
                      value={form.product_type}
                      onChange={(e) => update("product_type", e.target.value)}
                    />
                    <datalist id="product-types-list">
                      {Array.from(
                        new Set(commodityCodes.map((c) => c.product_type)),
                      )
                        .sort()
                        .map((p) => (
                          <option key={p} value={p} />
                        ))}
                    </datalist>
                  </FormField>
                ) : (
                  <FormField label="" className="col-span-1" />
                )}
                <FormField
                  label="Reason for movement"
                  confidence={autoFilled.reason}
                  className="col-span-2"
                >
                  <input
                    className={inputClass(autoFilled.reason)}
                    placeholder="e.g. Import for UK roasting"
                    value={form.reason}
                    onChange={(e) => update("reason", e.target.value)}
                  />
                </FormField>

                <div
                  className="col-span-2 pt-5 mt-2 border-t font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]"
                  style={{ borderColor: "var(--color-line-soft)" }}
                >
                  Landing &amp; costs
                </div>

                <FormField
                  label="PO number"
                  confidence={autoFilled.po_number}
                >
                  <input
                    className={inputClass(autoFilled.po_number)}
                    placeholder="e.g. PO-2026-0412"
                    value={form.po_number}
                    onChange={(e) => update("po_number", e.target.value)}
                  />
                </FormField>
                <FormField label="" className="col-span-1" />

                <FormField
                  label="Quantity"
                  confidence={autoFilled.quantity}
                >
                  <input
                    id="intake-field-quantity"
                    className={inputClass(autoFilled.quantity)}
                    type="number"
                    step="0.001"
                    placeholder="0"
                    value={form.quantity}
                    onChange={(e) => update("quantity", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Quantity unit"
                  confidence={autoFilled.quantity_unit}
                >
                  <select
                    className={inputClass(autoFilled.quantity_unit)}
                    value={form.quantity_unit}
                    onChange={(e) =>
                      update(
                        "quantity_unit",
                        e.target.value as QuantityUnit | "",
                      )
                    }
                  >
                    <option value="">— select —</option>
                    {QUANTITY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Expected landed">
                  <input
                    className="form-input"
                    type="date"
                    value={form.expected_landed_date}
                    onChange={(e) =>
                      update("expected_landed_date", e.target.value)
                    }
                  />
                </FormField>
                <FormField label="Actual landed">
                  <input
                    className="form-input"
                    type="date"
                    value={form.actual_landed_date}
                    onChange={(e) =>
                      update("actual_landed_date", e.target.value)
                    }
                  />
                </FormField>

                <FormField label="Customs status" className="col-span-2">
                  <select
                    className="form-input"
                    value={form.customs_status}
                    onChange={(e) =>
                      update(
                        "customs_status",
                        e.target.value as CustomsStatus | "",
                      )
                    }
                  >
                    <option value="">— select —</option>
                    {CUSTOMS_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label={`Freight · ${form.currency}`}>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.freight_cost}
                    onChange={(e) => update("freight_cost", e.target.value)}
                  />
                </FormField>
                <FormField label={`Insurance · ${form.currency}`}>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.insurance_cost}
                    onChange={(e) =>
                      update("insurance_cost", e.target.value)
                    }
                  />
                </FormField>
                <FormField label={`Duty · ${form.currency}`}>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.duty_cost}
                    onChange={(e) => update("duty_cost", e.target.value)}
                  />
                </FormField>
                <FormField label={`Other · ${form.currency}`}>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.other_costs}
                    onChange={(e) => update("other_costs", e.target.value)}
                  />
                </FormField>
              </div>

              {error && (
                <div
                  className="mt-4 p-3 rounded text-[13px] font-mono"
                  style={{
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                >
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        <footer
          className="px-7 py-4 border-t flex justify-between items-center gap-3"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <div className="text-[12px] text-[color:var(--color-ink-faint)]">
            {isEditing
              ? "Changes are logged to the shipment's activity."
              : showForm
                ? "Saves as a draft you can review later."
                : "Drop a PDF or image to auto-fill the form."}
          </div>
          <div className="flex gap-2.5">
            <button type="button" className="btn" onClick={handleClose}>
              Cancel
            </button>
            <button
              type="submit"
              form="intake-form"
              className="btn btn-primary"
              disabled={isPending || !showForm}
            >
              {isPending
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Save movement"}
            </button>
          </div>
        </footer>

        <style>{`
          .form-input {
            font-family: var(--font-sans);
            font-size: 13px;
            padding: 9px 12px;
            border: 1px solid var(--color-line);
            border-radius: 6px;
            background: var(--color-card);
            color: var(--color-ink);
            width: 100%;
            transition: border-color 0.15s, background 0.15s;
          }
          .form-input:focus {
            outline: none;
            border-color: var(--color-ink);
            box-shadow: 0 0 0 3px rgba(20,15,5,0.05);
          }
          .form-input.auto {
            border-color: var(--color-ok);
            background: rgba(61, 107, 78, 0.06);
          }
          .form-input.auto:focus {
            border-color: var(--color-ok);
            box-shadow: 0 0 0 3px rgba(61, 107, 78, 0.12);
          }
          .form-input.form-input-warn {
            border-color: var(--color-accent);
            background: var(--color-accent-soft);
          }
          .form-input.form-input-warn:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px rgba(180, 70, 50, 0.12);
          }
        `}</style>
      </div>
    </div>

    <HaulierModal
      open={addNew?.kind === "haulier"}
      onClose={() => setAddNew(null)}
      initialName={addNew?.kind === "haulier" ? addNew.initialName : undefined}
      zIndex={110}
      onCreated={(id, name) => {
        appendRefOption("haulier", { id, name, secondary: null });
        setRefValue("haulier", { id, label: name });
        setAddNew(null);
      }}
    />
    <SupplierModal
      open={addNew?.kind === "supplier"}
      onClose={() => setAddNew(null)}
      initialName={addNew?.kind === "supplier" ? addNew.initialName : undefined}
      incoterms={incoterms}
      zIndex={110}
      onCreated={(id, name) => {
        appendRefOption("supplier", { id, name, secondary: null });
        setRefValue("supplier", { id, label: name });
        setAddNew(null);
      }}
    />
    <IorModal
      open={addNew?.kind === "ior"}
      onClose={() => setAddNew(null)}
      initialName={addNew?.kind === "ior" ? addNew.initialName : undefined}
      zIndex={110}
      onCreated={(id, name) => {
        appendRefOption("ior", { id, name, secondary: null });
        setRefValue("ior", { id, label: name });
        setAddNew(null);
      }}
    />
    </>
  );
}

function RefWarning({
  kind,
  onAdd,
}: {
  kind: RefKind;
  onAdd: () => void;
}) {
  const noun = kind === "ior" ? "IOR" : kind;
  return (
    <div
      className="text-[11px] font-mono mt-1.5 flex items-center gap-2 flex-wrap"
      style={{ color: "var(--color-accent)" }}
    >
      <span>Free text — not in reference list.</span>
      <button
        type="button"
        onClick={onAdd}
        className="underline decoration-dotted underline-offset-2 hover:no-underline"
      >
        + Add as new {noun}
      </button>
    </div>
  );
}

function inputClass(confidence: number | undefined) {
  return confidence !== undefined ? "form-input auto" : "form-input";
}

function Dropzone({
  upload,
  onFile,
  onReset,
}: {
  upload: UploadState;
  onFile: (file: File) => void;
  onReset: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const busy = upload.phase === "uploading" || upload.phase === "extracting";

  return (
    <label
      htmlFor="intake-dropzone-file"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (busy) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className="block cursor-pointer rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors"
      style={{
        borderColor: dragActive
          ? "var(--color-ink)"
          : "var(--color-line)",
        background: dragActive
          ? "var(--color-paper-warm)"
          : "var(--color-card)",
      }}
    >
      <input
        id="intake-dropzone-file"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.currentTarget.value = "";
        }}
      />
      {upload.phase === "idle" && (
        <>
          <div className="font-serif text-[20px] mb-1">
            Drop a document here
          </div>
          <div className="text-[13px] text-[color:var(--color-ink-soft)]">
            PDF, PNG, JPEG, or WebP · up to 10 MB
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-3">
            or click to browse
          </div>
        </>
      )}
      {upload.phase === "uploading" && (
        <>
          <div className="font-serif text-[20px] mb-1">Uploading…</div>
          <div className="text-[13px] text-[color:var(--color-ink-soft)] truncate">
            {upload.filename}
          </div>
        </>
      )}
      {upload.phase === "extracting" && (
        <>
          <div className="font-serif text-[20px] mb-1">
            Reading the document…
          </div>
          <div className="text-[13px] text-[color:var(--color-ink-soft)] truncate">
            {upload.filename}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-3">
            This usually takes 5–15 seconds
          </div>
        </>
      )}
      {upload.phase === "error" && (
        <>
          <div
            className="font-serif text-[20px] mb-1"
            style={{ color: "var(--color-accent)" }}
          >
            Something went wrong
          </div>
          <div className="text-[13px] text-[color:var(--color-ink-soft)]">
            {upload.message}
          </div>
          <button
            type="button"
            className="font-mono text-[11px] underline mt-3"
            onClick={(e) => {
              e.preventDefault();
              onReset();
            }}
          >
            Try again
          </button>
        </>
      )}
    </label>
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-2.5 rounded-md text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 ${
        active
          ? "bg-white text-[color:var(--color-ink)] shadow-sm"
          : disabled
            ? "text-[color:var(--color-ink-faint)] cursor-not-allowed"
            : "text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function FxRow({
  rate,
  source,
  onChange,
  initiallyEditable,
}: {
  rate: string;
  source: FxRateSource | "";
  onChange: (v: string) => void;
  initiallyEditable?: boolean;
}) {
  // editMode lets the user unlock the input without mutating source
  // (so a needs_review flag stays until the first actual keystroke).
  const [editMode, setEditMode] = useState(initiallyEditable ?? false);
  const isNeedsReview = source === "needs_review";
  const isManual = source === "manual";
  const isPending = !source && !rate;
  const editable = editMode || isManual || isNeedsReview;

  const labelSuffix = isManual
    ? " · Manual (override)"
    : source === "frankfurter"
      ? " · Frankfurter"
      : isNeedsReview
        ? " · Needs review"
        : editMode
          ? " · Override (type to apply)"
          : "";
  const sourceLabel = source ? FX_RATE_SOURCE_LABELS[source] : "—";

  return (
    <FormField
      label={`FX rate (to GBP)${labelSuffix}`}
      className="col-span-2"
    >
      {editable ? (
        <input
          id="intake-field-fx_rate_to_gbp"
          className={
            isNeedsReview
              ? "form-input form-input-warn"
              : "form-input"
          }
          type="number"
          step="0.000001"
          placeholder={isNeedsReview ? "Enter a rate manually" : "0.000000"}
          value={rate}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div
          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <span className="font-mono text-[12px]">
            {isPending ? (
              <span className="text-[color:var(--color-ink-faint)]">
                Rate will be set when saved
              </span>
            ) : rate ? (
              <>
                {rate}{" "}
                <span className="text-[color:var(--color-ink-faint)]">
                  · {sourceLabel}
                </span>
              </>
            ) : (
              <span className="text-[color:var(--color-ink-faint)]">—</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="font-mono text-[11px] underline text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
          >
            Override
          </button>
        </div>
      )}
      {isNeedsReview && (
        <div
          className="text-[11px] font-mono"
          style={{ color: "var(--color-accent)" }}
        >
          FX rate needs review — enter manually.
        </div>
      )}
    </FormField>
  );
}

function FormField({
  label,
  children,
  className = "",
  confidence,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
  confidence?: number;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
          {label || "\u00a0"}
        </label>
        {confidence !== undefined && (
          <span
            className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: "var(--color-ok-soft)",
              color: "var(--color-ok)",
            }}
          >
            auto · {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
