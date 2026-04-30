"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplier,
  updateSupplier,
  type SupplierInput,
} from "@/lib/actions/suppliers";
import type { Supplier, Incoterm } from "@/lib/types";

type FormState = {
  name: string;
  country: string;
  commodity_focus: string;
  default_incoterm: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  country: "",
  commodity_focus: "",
  default_incoterm: "",
  notes: "",
};

function fromSupplier(s: Supplier | null): FormState {
  if (!s) return EMPTY;
  return {
    name: s.name,
    country: s.country ?? "",
    commodity_focus: s.commodity_focus ?? "",
    default_incoterm: s.default_incoterm ?? "",
    notes: s.notes ?? "",
  };
}

function toInput(form: FormState): SupplierInput {
  return {
    name: form.name,
    country: form.country || null,
    commodity_focus: form.commodity_focus || null,
    default_incoterm: form.default_incoterm || null,
    notes: form.notes || null,
  };
}

export function SupplierModal({
  open,
  onClose,
  editing = null,
  initialName,
  incoterms,
  onCreated,
  zIndex = 100,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Supplier | null;
  initialName?: string;
  incoterms: Incoterm[];
  onCreated?: (id: string, name: string) => void;
  zIndex?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromSupplier(editing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      const base = fromSupplier(editing);
      setForm(
        editing || !initialName ? base : { ...base, name: initialName },
      );
      setError(null);
    }
  }, [open, editing, initialName]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(form);
    if (!input.name.trim()) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      if (editing) {
        const result = await updateSupplier(editing.id, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createSupplier(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (onCreated) onCreated(result.data.id, input.name.trim());
      }
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 grid place-items-center p-4"
      style={{
        background: "rgba(20,15,5,0.4)",
        backdropFilter: "blur(4px)",
        zIndex,
      }}
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
                Edit <em className="text-[color:var(--color-ink-soft)]">supplier</em>
              </>
            ) : (
              <>
                Add a <em className="text-[color:var(--color-ink-soft)]">supplier</em>
              </>
            )}
          </div>
        </header>

        <form id="supplier-form" onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 gap-y-3.5">
            <Field label="Name *" className="col-span-2">
              <input
                className="form-input"
                placeholder="e.g. Falcon Coffees"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                autoFocus={!editing}
              />
            </Field>
            <Field label="Country">
              <input
                className="form-input"
                placeholder="e.g. BR"
                maxLength={3}
                value={form.country}
                onChange={(e) => update("country", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Commodity focus">
              <input
                className="form-input"
                placeholder="e.g. Green coffee"
                value={form.commodity_focus}
                onChange={(e) => update("commodity_focus", e.target.value)}
              />
            </Field>
            <Field label="Default incoterm" className="col-span-2">
              <select
                className="form-input"
                value={form.default_incoterm}
                onChange={(e) => update("default_incoterm", e.target.value)}
              >
                <option value="">— none —</option>
                {incoterms.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.code} · {i.full_name}
                  </option>
                ))}
              </select>
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
            form="supplier-form"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add supplier"}
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
