"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIor, updateIor, type IorInput } from "@/lib/actions/iors";
import type { Ior } from "@/lib/types";

type FormState = {
  name: string;
  country: string;
  vat_country: string;
  eori_number: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  country: "",
  vat_country: "",
  eori_number: "",
  notes: "",
};

function fromIor(i: Ior | null): FormState {
  if (!i) return EMPTY;
  return {
    name: i.name,
    country: i.country ?? "",
    vat_country: i.vat_country ?? "",
    eori_number: i.eori_number ?? "",
    notes: i.notes ?? "",
  };
}

function toInput(form: FormState): IorInput {
  return {
    name: form.name,
    country: form.country || null,
    vat_country: form.vat_country || null,
    eori_number: form.eori_number || null,
    notes: form.notes || null,
  };
}

export function IorModal({
  open,
  onClose,
  editing = null,
  onCreated,
  zIndex = 100,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Ior | null;
  onCreated?: (id: string, name: string) => void;
  zIndex?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromIor(editing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setForm(fromIor(editing));
      setError(null);
    }
  }, [open, editing]);

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
        const result = await updateIor(editing.id, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createIor(input);
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
                Edit <em className="text-[color:var(--color-ink-soft)]">IOR</em>
              </>
            ) : (
              <>
                Add an <em className="text-[color:var(--color-ink-soft)]">IOR</em>
              </>
            )}
          </div>
        </header>

        <form id="ior-form" onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 gap-y-3.5">
            <Field label="Name *" className="col-span-2">
              <input
                className="form-input"
                placeholder="e.g. Meridian UK Ltd"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                autoFocus={!editing}
              />
            </Field>
            <Field label="Country">
              <input
                className="form-input"
                placeholder="Entity residency, e.g. GB"
                maxLength={3}
                value={form.country}
                onChange={(e) => update("country", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="VAT country">
              <input
                className="form-input"
                placeholder="Where they file VAT, e.g. FR"
                maxLength={3}
                value={form.vat_country}
                onChange={(e) =>
                  update("vat_country", e.target.value.toUpperCase())
                }
              />
            </Field>
            <Field label="EORI number" className="col-span-2">
              <input
                className="form-input font-mono text-[12px]"
                placeholder="e.g. GB123456789000"
                value={form.eori_number}
                onChange={(e) => update("eori_number", e.target.value)}
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
            form="ior-form"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending ? "Saving…" : editing ? "Save changes" : "Add IOR"}
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
