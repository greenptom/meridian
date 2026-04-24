"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createJurisdiction,
  updateJurisdiction,
  type JurisdictionInput,
} from "@/lib/actions/jurisdictions";
import {
  JURISDICTION_STATUS_LABELS,
  type Jurisdiction,
  type JurisdictionStatus,
} from "@/lib/types";

// Common coffee-trade + EU destinations, roughly in order of relevance.
// Not exhaustive — the input is free-text, this is just a datalist hint.
const COUNTRY_OPTIONS: Array<{ code: string; name: string }> = [
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "US", name: "United States" },
  { code: "BR", name: "Brazil" },
  { code: "CO", name: "Colombia" },
  { code: "ET", name: "Ethiopia" },
  { code: "KE", name: "Kenya" },
  { code: "VN", name: "Vietnam" },
];

const STATUSES: JurisdictionStatus[] = [
  "active",
  "query_on_hold",
  "not_registered",
];

type FormState = {
  country_code: string;
  country_name: string;
  vat_number: string;
  status: JurisdictionStatus;
  registered_date: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  country_code: "",
  country_name: "",
  vat_number: "",
  status: "active",
  registered_date: "",
  notes: "",
};

function fromJurisdiction(j: Jurisdiction | null): FormState {
  if (!j) return EMPTY_FORM;
  return {
    country_code: j.country_code,
    country_name: j.country_name,
    vat_number: j.vat_number ?? "",
    status: j.status,
    registered_date: j.registered_date ?? "",
    notes: j.notes ?? "",
  };
}

function toInput(form: FormState): JurisdictionInput {
  return {
    country_code: form.country_code,
    country_name: form.country_name,
    vat_number: form.vat_number || null,
    status: form.status,
    registered_date: form.registered_date || null,
    notes: form.notes || null,
  };
}

export function JurisdictionModal({
  open,
  onClose,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Jurisdiction | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromJurisdiction(editing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setForm(fromJurisdiction(editing));
      setError(null);
    }
  }, [open, editing]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-fill country_name from a matching code when the field is empty.
      if (key === "country_code" && !f.country_name) {
        const match = COUNTRY_OPTIONS.find(
          (c) => c.code === String(value).toUpperCase(),
        );
        if (match) next.country_name = match.name;
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(form);
    if (!input.country_code.trim() || !input.country_name.trim()) {
      setError("Country code and name are required.");
      return;
    }
    startTransition(async () => {
      const result = editing
        ? await updateJurisdiction(editing.id, input)
        : await createJurisdiction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "rgba(20,15,5,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[520px] shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-6 pt-5 pb-4 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="font-serif text-[24px] font-normal tracking-tight">
            {editing ? (
              <>
                Edit <em className="text-[color:var(--color-ink-soft)]">jurisdiction</em>
              </>
            ) : (
              <>
                Add a <em className="text-[color:var(--color-ink-soft)]">jurisdiction</em>
              </>
            )}
          </div>
          {editing && (
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              {editing.country_code}
            </div>
          )}
        </header>

        <form id="jurisdiction-form" onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 gap-y-3.5">
            <Field label="Country code *">
              <input
                className="form-input"
                placeholder="e.g. GB"
                list="jurisdiction-country-codes"
                value={form.country_code}
                onChange={(e) =>
                  update("country_code", e.target.value.toUpperCase())
                }
                maxLength={3}
                autoFocus={!editing}
              />
              <datalist id="jurisdiction-country-codes">
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Country name *">
              <input
                className="form-input"
                placeholder="e.g. United Kingdom"
                value={form.country_name}
                onChange={(e) => update("country_name", e.target.value)}
              />
            </Field>
            <Field label="VAT number" className="col-span-2">
              <input
                className="form-input font-mono text-[12px]"
                placeholder="e.g. GB337104819"
                value={form.vat_number}
                onChange={(e) => update("vat_number", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                className="form-input"
                value={form.status}
                onChange={(e) =>
                  update("status", e.target.value as JurisdictionStatus)
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {JURISDICTION_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Registered date">
              <input
                className="form-input"
                type="date"
                value={form.registered_date}
                onChange={(e) => update("registered_date", e.target.value)}
              />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea
                className="form-input"
                rows={3}
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
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

        <footer
          className="px-6 py-4 border-t flex justify-end gap-2.5"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="jurisdiction-form"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add jurisdiction"}
          </button>
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
        `}</style>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        {label}
      </label>
      {children}
    </div>
  );
}
