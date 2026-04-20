"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createShipment } from "@/lib/actions/shipments";
import { linkDocumentToShipment } from "@/lib/actions/documents";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Incoterm, CommodityCode } from "@/lib/types";
import type {
  ExtractedShipment,
  ExtractedFieldName,
} from "@/lib/extraction/schema";

type FormState = {
  origin_country: string;
  destination_country: string;
  supplier_name: string;
  haulier_name: string;
  incoterm: string;
  commodity_code: string;
  invoice_value: string;
  currency: string;
  ior_name: string;
  reason: string;
};

const INITIAL_FORM: FormState = {
  origin_country: "",
  destination_country: "",
  supplier_name: "",
  haulier_name: "",
  incoterm: "",
  commodity_code: "",
  invoice_value: "",
  currency: "GBP",
  ior_name: "",
  reason: "",
};

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
}: {
  open: boolean;
  onClose: () => void;
  incoterms: Incoterm[];
  commodityCodes: CommodityCode[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [autoFilled, setAutoFilled] = useState<
    Partial<Record<ExtractedFieldName, number>>
  >({});
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [documentId, setDocumentId] = useState<string | null>(null);

  function resetAll() {
    setForm(INITIAL_FORM);
    setAutoFilled({});
    setUpload({ phase: "idle" });
    setDocumentId(null);
    setError(null);
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
    function take<K extends ExtractedFieldName>(
      key: K,
      formKey: keyof FormState,
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

    if (!nextForm.currency) nextForm.currency = "GBP";

    setForm(nextForm);
    setAutoFilled(filled);
    setDocumentId(payload.documentId);
    setUpload({ phase: "done", filename: file.name });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createShipment({
        origin_country: form.origin_country || null,
        destination_country: form.destination_country || null,
        supplier_name: form.supplier_name || null,
        haulier_name: form.haulier_name || null,
        incoterm: form.incoterm || null,
        commodity_code: form.commodity_code || null,
        product_type: null,
        invoice_value: form.invoice_value
          ? parseFloat(form.invoice_value)
          : null,
        currency: form.currency || "GBP",
        ior_name: form.ior_name || null,
        reason: form.reason || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (documentId) {
        await linkDocumentToShipment(documentId, result.data.id);
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
    tab === 2 || (tab === 0 && upload.phase === "done");

  return (
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
              Log a <em className="text-[color:var(--color-ink-soft)]">movement</em>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              Three ways to get data in
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

          {tab === 0 && upload.phase !== "done" && (
            <Dropzone
              upload={upload}
              onFile={handleFile}
              onReset={() => setUpload({ phase: "idle" })}
            />
          )}

          {showForm && (
            <form id="intake-form" onSubmit={handleSubmit}>
              {tab === 0 && upload.phase === "done" && (
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
                  <input
                    className={inputClass(autoFilled.supplier_name)}
                    placeholder="Supplier name"
                    value={form.supplier_name}
                    onChange={(e) => update("supplier_name", e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Haulier"
                  confidence={autoFilled.haulier_name}
                >
                  <input
                    className={inputClass(autoFilled.haulier_name)}
                    placeholder="DHL / DPD / Europa"
                    value={form.haulier_name}
                    onChange={(e) => update("haulier_name", e.target.value)}
                  />
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
                  <select
                    className={inputClass(autoFilled.commodity_code)}
                    value={form.commodity_code}
                    onChange={(e) => update("commodity_code", e.target.value)}
                  >
                    <option value="">— select product —</option>
                    {commodityCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.product_type} · {c.code}
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
                <FormField label="Importer of Record">
                  <input
                    className="form-input"
                    placeholder="IOR entity name"
                    value={form.ior_name}
                    onChange={(e) => update("ior_name", e.target.value)}
                  />
                </FormField>
                <FormField label="" className="col-span-1" />
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
            {showForm
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
              {isPending ? "Saving…" : "Save movement"}
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
        `}</style>
      </div>
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
